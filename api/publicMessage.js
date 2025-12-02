// api/publicMessage.js
//
// Lecture "publique" d'un murmure pour un bijou identifié par public_id (ou id)
// - IA texte (style + persona identiques à api/message.js)
// - IA audio (OpenAI TTS)
// - Pas de décrément, pas de mise à jour en base
//
// Réponse :
// { ok: true, id, public_id, langue, text, audio }

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Clé OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function hasOpenAIKey() {
  return typeof OPENAI_API_KEY === "string" && OPENAI_API_KEY.trim().length > 0;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Méthode non autorisée" });
  }

  try {
    const { public_id, id, lang: langParam } = req.query || {};

    if (!public_id && !id) {
      return res.status(400).json({
        ok: false,
        error: "missing_id",
        message: "Paramètre public_id ou id manquant."
      });
    }

    // ─────────────────────────────────────
    // 1) Récupération du bijou
    // ─────────────────────────────────────
    const query = supabase
      .from("bijous")
      .select(`
        id, public_id,
        prenom, intention, detail,
        theme, sous_theme,
        voix,
        langue,
        etat,
        locked
      `)
      .limit(1);

    if (public_id) query.eq("public_id", public_id);
    else query.eq("id", id);

    const { data: rows, error: fetchError } = await query;

    if (fetchError) {
      console.error("Erreur récupération bijou:", fetchError);
      return res.status(200).json({
        ok: false,
        error: "db_error",
        message: "Erreur de connexion à la base."
      });
    }

    const bijou = rows && rows[0];
    if (!bijou) {
      return res.status(200).json({
        ok: false,
        error: "not_found",
        message:
          "Ce bijou n’est pas encore relié à sa voix. Contactez l’atelier."
      });
    }

    // ─────────────────────────────────────
    // 2) Langue
    // ─────────────────────────────────────
    const langue = (langParam || bijou.langue || "fr").toLowerCase();
    const isEn = langue === "en";

    // ─────────────────────────────────────
    // 3) Cas bijou non configuré
    // ─────────────────────────────────────
    const etat = (bijou.etat || "").toLowerCase();
    const estNonConfigure = etat.includes("non") && etat.includes("configur");

    if (estNonConfigure) {
      return res.status(200).json({
        ok: true,
        id: bijou.id,
        public_id: bijou.public_id,
        langue,
        text: isEn
          ? "This jewel has been created, but its whisper has not yet been written."
          : "Ce bijou a été créé, mais son murmure n’a pas encore été écrit.",
        audio: null
      });
    }

    // ─────────────────────────────────────
    // 4) Contexte du murmure
    // ─────────────────────────────────────
    const prenom = bijou.prenom || (isEn ? "you" : "toi");
    const intention = bijou.intention || "";
    const detail = bijou.detail || "";
    const theme = bijou.theme || "";
    const sousTheme = bijou.sous_theme || "";
    const voix = (bijou.voix || "neutre").toLowerCase();

    // ─────────────────────────────────────
    // 5) Génération du texte (IA ou fallback)
    // ─────────────────────────────────────
    let texte;

    if (hasOpenAIKey()) {
      try {
        texte = await generatePoeticWhisperWithOpenAI({
          langue,
          prenom,
          intention,
          detail,
          theme,
          sousTheme
        });
      } catch (err) {
        console.error("Erreur IA texte:", err);
        texte = genererMurmureSimple({
          langue,
          prenom,
          intention,
          detail,
          theme,
          sousTheme,
          voix
        });
      }
    } else {
      texte = genererMurmureSimple({
        langue,
        prenom,
        intention,
        detail,
        theme,
        sousTheme,
        voix
      });
    }

    // ─────────────────────────────────────
    // 6) Audio IA (facultatif)
    // ─────────────────────────────────────
    let audioDataUrl = null;
    if (hasOpenAIKey()) {
      try {
        audioDataUrl = await generateSpeechFromText({
          texte,
          langue,
          voix,
          theme,
          sousTheme
        });
      } catch (err) {
        console.error("Erreur IA audio:", err);
      }
    }

    // ─────────────────────────────────────
    // 7) Réponse finale
    // ─────────────────────────────────────
    return res.status(200).json({
      ok: true,
      id: bijou.id,
      public_id: bijou.public_id,
      langue,
      text: texte,
      audio: audioDataUrl
    });
  } catch (e) {
    console.error("Erreur interne /api/publicMessage:", e);
    return res.status(200).json({
      ok: false,
      error: "internal_error",
      message: "Erreur interne."
    });
  }
}

//
// ─────────────────────────────────────────────
//   HELPERS  (identiques à api/message.js)
//   Style + persona + fallback + voices
// ─────────────────────────────────────────────
//

// =============================================================================
// STYLE selon thème + sous-thème
// =============================================================================
function getThemeStyleHints(theme, sousTheme, langue) {
  const t = (theme || "").toLowerCase();
  const st = (sousTheme || "").toLowerCase();
  const isEn = langue === "en";
  const EN = (fr, en) => (isEn ? en : fr);

  // AMOUR + sensualité complice
  if (t.includes("amour") || t.includes("love")) {
    if (st.includes("sensual") || st.includes("complice")) {
      return EN(
        "Style : sensuel, élégant, suggéré. Proximité, peau, chaleur, jamais de vulgarité.",
        "Style: sensual, elegant, suggestive. Closeness, warmth, skin, never vulgar."
      );
    }
    return EN(
      "Style : intime, tendre, chuchoté. Gestes simples, détails partagés.",
      "Style: intimate, tender, whispered. Simple gestures, shared details."
    );
  }

  // GRATITUDE
  if (t.includes("gratitude")) {
    return EN(
      "Style : chaleureux, reconnaissant, lumière douce.",
      "Style: warm, thankful, gentle light."
    );
  }

  // GUÉRISON
  if (t.includes("guer") || t.includes("heal")) {
    return EN(
      "Style : enveloppant, lent, respiré, comme une main posée sur l’épaule.",
      "Style: enveloping, slow, breathed, like a hand resting on the shoulder."
    );
  }

  // NUIT / RÊVES
  if (t.includes("rêves") || t.includes("dream") || t.includes("nuit") || t.includes("night")) {
    return EN(
      "Style : nocturne, doux, étoilé, comme une veilleuse.",
      "Style: nocturnal, soft, starry, like a night light."
    );
  }

  // Par défaut
  return EN(
    "Style : doux, intime, poétique, souffle et lumière.",
    "Style: soft, intimate, poetic, breath and light."
  );
}

// =============================================================================
// PERSONA
// =============================================================================
function getThemePersona(langue, theme, sousTheme) {
  const t = (theme || "").toLowerCase();
  const isEn = langue === "en";
  const EN = (fr, en) => (isEn ? en : fr);

  if (t.includes("amour") || t.includes("love")) {
    return EN(
      "Tu parles comme un être très proche, pudique et sensible.",
      "You speak like someone very close, delicate and discreet."
    );
  }

  if (t.includes("guer") || t.includes("heal")) {
    return EN(
      "Tu parles comme un refuge calme qui enveloppe.",
      "You speak like a calm refuge that surrounds gently."
    );
  }

  if (t.includes("rêves") || t.includes("dream") || t.includes("nuit") || t.includes("night")) {
    return EN(
      "Tu parles comme une berceuse murmurée dans la nuit.",
      "You speak like a lullaby whispered at night."
    );
  }

  return EN(
    "Tu parles comme une présence attentive nichée dans le bois.",
    "You speak like a caring presence living in the wood."
  );
}

// =============================================================================
// IA TEXTE (identique à api/message.js)
// =============================================================================
async function generatePoeticWhisperWithOpenAI({
  langue,
  prenom,
  intention,
  detail,
  theme,
  sousTheme
}) {
  const isEn = langue === "en";
  const name = prenom || (isEn ? "you" : "toi");
  const styleHints = getThemeStyleHints(theme, sousTheme, langue);
  const persona = getThemePersona(langue, theme, sousTheme);

  const system = isEn
    ? "You are a gentle poetic voice inside a wooden jewel. You write intimate whispers (5–9 short lines). Never say you are an AI. Never mention message/text. Speak as the jewel itself."
    : "Tu es une voix poétique qui habite dans un bijou en bois. Tu écris de courts murmures intimes (5 à 9 lignes). Ne dis jamais que tu es une IA. Ne parle jamais de message ou de texte. Tu es le bijou.";

  const userPrompt = isEn
    ? `Write a poetic whisper for ${name}.

Theme: ${theme}
Sub-theme: ${sousTheme}
Intention: ${intention}
Detail: ${detail}

Persona:
${persona}

Style:
${styleHints}

Constraints:
- 5 to 9 short lines
- Whispered tone, soft and intimate
- Jewel speaks in the first person
- No explanations, only sensory images`
    : `Écris un murmure poétique pour ${name}.

Thème : ${theme}
Sous-thème : ${sousTheme}
Intention : ${intention}
Détail : ${detail}

Persona :
${persona}

Style :
${styleHints}

Contraintes :
- Entre 5 et 9 lignes courtes
- Ton murmuré, intime
- Le bijou parle à la première personne
- Pas d’explications ; des images sensorielles`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.95,
      max_tokens: 400
    })
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error("Erreur OpenAI texte: " + err.slice(0, 200));
  }

  const data = await resp.json();
  return (
    data.choices?.[0]?.message?.content?.trim() ||
    (isEn ? "I am here, quietly with you." : "Je suis là, tout près de toi.")
  );
}

// =============================================================================
// Fallback texte
// =============================================================================
function genererMurmureSimple({
  langue,
  prenom,
  intention,
  detail,
  theme,
  sousTheme
}) {
  const nom = prenom || (langue === "en" ? "you" : "toi");

  if (langue === "en") {
    let base = `"${nom}, a soft whisper rises from the wood."`;
    return base;
  }

  return `« ${nom}, un murmure s'élève du bois. »`;
}

// =============================================================================
// Voice according to theme
// =============================================================================
function pickVoiceName({ voix, theme }) {
  const v = (voix || "").toLowerCase();
  const t = (theme || "").toLowerCase();

  const fem = v.includes("fem");
  const masc = v.includes("mas");

  if (t.includes("amour")) {
    if (masc) return "onyx";
    if (fem) return "nova";
    return "nova";
  }

  if (t.includes("guer") || t.includes("heal")) {
    if (fem) return "fable";
    if (masc) return "alloy";
    return "fable";
  }

  if (t.includes("rêves") || t.includes("night")) {
    if (fem) return "fable";
    if (masc) return "echo";
    return "alloy";
  }

  if (fem) return "nova";
  if (masc) return "onyx";
  return "alloy";
}

// =============================================================================
// Audio TTS
// =============================================================================
async function generateSpeechFromText({ texte, langue, voix, theme }) {
  if (!texte || !OPENAI_API_KEY) return null;

  const voiceName = pickVoiceName({ voix, theme });

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: voiceName,
      input: texte
    })
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error("Erreur TTS: " + err.slice(0, 200));
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  return `data:audio/mp3;base64,${buffer.toString("base64")}`;
}
