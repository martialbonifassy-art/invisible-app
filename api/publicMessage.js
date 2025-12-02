// api/publicMessage.js
//
// VERSION PRODUCTION (SECURISÉE)
// - Signature HMAC 256 (token signé en URL)
// - IA texte + IA audio
// - Décrémentation messages_restants
// - Mise à jour date_dernier_murmure
// - Blocage si locked ou 0 murmurres
// - Respect du choix de langue FR/EN
// - Aucun accès aux données sensibles
// - Compatible architecture NFC définitive
//
// Entrée : ?token=URL_SIGNÉ
//
// Réponse JSON :
// {
//   ok: true,
//   id,
//   public_id,
//   langue,
//   text,
//   audio,
//   messages_restants
// }

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SIGN_KEY = process.env.SIGN_KEY; // clé HMAC secrète
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Vérifier que tout est bien configuré
function hasOpenAI() {
  return typeof OPENAI_API_KEY === "string" && OPENAI_API_KEY.trim().length > 0;
}
function hasSignKey() {
  return typeof SIGN_KEY === "string" && SIGN_KEY.trim().length >= 32;
}

// Vérifie la signature HMAC et extrait { public_id, exp }
function verifySignedToken(token) {
  try {
    const payloadB64 = token.split(".")[0];
    const signature = token.split(".")[1];
    if (!payloadB64 || !signature) return null;

    const expectedSig = crypto
      .createHmac("sha256", SIGN_KEY)
      .update(payloadB64)
      .digest("hex");

    if (signature !== expectedSig) return null;

    const json = JSON.parse(Buffer.from(payloadB64, "base64").toString());
    if (!json.public_id) return null;

    if (json.exp && Date.now() > json.exp) return null; // token expiré

    return json;
  } catch (err) {
    console.error("verifySignedToken error:", err);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!hasSignKey()) {
    return res.status(500).json({
      ok: false,
      error: "missing_sign_key",
      message: "SIGN_KEY absent dans les variables."
    });
  }

  // Token signé obligatoire
  const token = req.query.token;
  if (!token) {
    return res.status(400).json({
      ok: false,
      error: "missing_token",
      message: "Lien invalide (token manquant)."
    });
  }

  // Vérification du token
  const verified = verifySignedToken(token);
  if (!verified) {
    return res.status(403).json({
      ok: false,
      error: "invalid_token",
      message: "Lien expiré ou invalide."
    });
  }

  const public_id = verified.public_id;

  // Charger le bijou
  const { data: rows, error } = await supabase
    .from("bijoux")
    .select(
      `
      id,
      public_id,
      prenom,
      intention,
      detail,
      theme,
      sous_theme,
      voix,
      langue,
      messages_restants,
      messages_max,
      etat,
      locked
    `
    )
    .eq("public_id", public_id)
    .limit(1);

  if (error) {
    console.error("DB error:", error);
    return res.status(500).json({ ok: false, error: "db_error" });
  }

  const bijou = rows?.[0];
  if (!bijou) {
    return res.status(404).json({
      ok: false,
      error: "not_found",
      message: "Ce bijou n'existe pas."
    });
  }
  // Déterminer la langue finale (FR par défaut)
  const langue = (bijou.langue || "fr").toLowerCase();
  const isEN = langue === "en";

  // État : non configuré
  const etat = (bijou.etat || "").toLowerCase();
  if (etat.includes("non") && etat.includes("configur")) {
    return res.status(200).json({
      ok: true,
      id: bijou.id,
      public_id,
      langue,
      text: isEN
        ? "This jewel has been created, but its whisper has not yet been written."
        : "Ce bijou a été créé, mais son murmure n’a pas encore été écrit.",
      audio: null,
      messages_restants: bijou.messages_restants
    });
  }

  // État : verrouillé (cycle terminé)
  if (bijou.locked) {
    return res.status(200).json({
      ok: true,
      id: bijou.id,
      public_id,
      langue,
      text: isEN
        ? "This jewel has completed its cycle of whispers. It now keeps silent."
        : "Ce bijou a terminé son cycle de murmures. Il reste silencieux désormais.",
      audio: null,
      messages_restants: bijou.messages_restants
    });
  }

  // Si plus de murmures disponibles
  if (bijou.messages_restants <= 0) {
    return res.status(200).json({
      ok: true,
      id: bijou.id,
      public_id,
      langue,
      text: isEN
        ? "This jewel has no remaining whispers. It needs to be recharged."
        : "Ce bijou n’a plus de murmure disponible. Il doit être rechargé.",
      audio: null,
      messages_restants: 0
    });
  }

  // EXTRACTION DES PARAMÈTRES POUR IA
  const ctx = {
    langue,
    prenom: bijou.prenom || (isEN ? "you" : "toi"),
    intention: bijou.intention || "",
    detail: bijou.detail || "",
    theme: bijou.theme || "",
    sousTheme: bijou.sous_theme || "",
    voix: bijou.voix || "neutre"
  };

  // GÉNÉRATION DU TEXTE — IA ou fallback
  let texteFinal;
  try {
    if (hasOpenAI()) {
      texteFinal = await generateWhisperText(ctx);
    } else {
      texteFinal = generateFallbackWhisper(ctx);
    }
  } catch (err) {
    console.error("Erreur IA texte:", err);
    texteFinal = generateFallbackWhisper(ctx);
  }

  // GÉNÉRATION DE L’AUDIO — facultatif
  let audioBase64 = null;
  try {
    if (hasOpenAI()) {
      audioBase64 = await generateWhisperAudio(texteFinal, ctx);
    }
  } catch (err) {
    console.error("Erreur IA audio:", err);
    audioBase64 = null;
  }

  // DÉCRÉMENTATION
  const newRemaining = Math.max(0, (bijou.messages_restants || 0) - 1);

  const { error: updateError } = await supabase
    .from("bijoux")
    .update({
      messages_restants: newRemaining,
      date_dernier_murmure: new Date().toISOString()
    })
    .eq("id", bijou.id);

  if (updateError) {
    console.error("Erreur update messages_restants:", updateError);
  }

  // RÉPONSE FINALE
  return res.status(200).json({
    ok: true,
    id: bijou.id,
    public_id,
    langue,
    text: texteFinal,
    audio: audioBase64,
    messages_restants: newRemaining
  });
}
// ─────────────────────────────────────────────
//  HELPERS : style selon thème & sous-thème
// ─────────────────────────────────────────────
function getStyleHints(theme, sousTheme, langue) {
  const t = (theme || "").toLowerCase();
  const st = (sousTheme || "").toLowerCase();
  const isEN = langue === "en";

  const EN = (fr, en) => (isEN ? en : fr);

  // Amour
  if (t.includes("amour") || t.includes("love")) {
    if (st.includes("sensual")) {
      return EN(
        "Style : sensuel, élégant, suggéré. Tu évoques des frôlements et la proximité des corps avec poésie, jamais de vulgarité.",
        "Style: sensual, elegant, suggestive. Evoke closeness, skin, warmth, always poetic, never vulgar."
      );
    }
    return EN(
      "Style : intime, tendre, presque chuchoté. Gestes simples, détails partagés.",
      "Style: intimate, tender, almost whispered. Simple shared gestures and atmosphere."
    );
  }

  // Gratitude
  if (t.includes("gratitude") || t.includes("thanks")) {
    return EN(
      "Style : chaleureux, lumineux, centré sur la reconnaissance profonde.",
      "Style: warm, glowing, centered on deep gratitude."
    );
  }

  // Guérison / apaisement
  if (t.includes("guérison") || t.includes("healing")) {
    return EN(
      "Style : très doux, apaisant, comme une main posée sur l’épaule.",
      "Style: soft, soothing, like a gentle hand resting on the shoulder."
    );
  }

  // Nuit, rêves
  if (t.includes("rêves") || t.includes("night")) {
    return EN(
      "Style : nocturne, brumeux, très doux, presque une berceuse.",
      "Style: nocturnal, misty, soft, almost a lullaby."
    );
  }

  return EN(
    "Style : doux, intime, poétique, images de bois, souffle, lumière.",
    "Style: gentle, poetic, intimate, with wood, breath and light imagery."
  );
}

// ─────────────────────────────────────────────
//  HELPERS : persona
// ─────────────────────────────────────────────
function getPersona(langue, theme) {
  const isEN = langue === "en";
  const t = (theme || "").toLowerCase();

  const EN = (fr, en) => (isEN ? en : fr);

  if (t.includes("amour") || t.includes("love")) {
    return EN(
      "Tu parles comme un être très proche, délicat, pudique.",
      "You speak like someone very close, tender, discreet."
    );
  }

  if (t.includes("guérison") || t.includes("healing")) {
    return EN(
      "Tu parles comme un refuge calme, qui enveloppe sans juger.",
      "You speak like a calm refuge, enveloping without judging."
    );
  }

  if (t.includes("rêves") || t.includes("night")) {
    return EN(
      "Tu parles comme une veilleuse qui murmure dans la nuit.",
      "You speak like a soft night-light whispering in the dark."
    );
  }

  return EN(
    "Tu parles comme une présence bienveillante nichée dans le bois.",
    "You speak like a gentle presence nestled in the wood."
  );
}

// ─────────────────────────────────────────────
//  IA TEXTE (GPT-4.1-mini)
// ─────────────────────────────────────────────
async function generateWhisperText(ctx) {
  const { langue, prenom, intention, detail, theme, sousTheme } = ctx;
  const isEN = langue === "en";

  const system = isEN
    ? "You are a poetic voice living inside a wooden jewel. You write short intimate whispers (5 to 9 lines). Never mention being an AI. Never mention 'message' or 'text'."
    : "Tu es une voix poétique qui habite dans un bijou en bois. Tu écris de courts murmures intimes (5 à 9 lignes). Ne dis jamais que tu es une IA. Ne parle jamais de message ou de texte.";

  const styleHints = getStyleHints(theme, sousTheme, langue);
  const persona = getPersona(langue, theme);

  const userPrompt = isEN
    ? `Write a poetic whisper for ${prenom}.

Theme: ${theme || "not specified"}
Sub-theme: ${sousTheme || "not specified"}
Intention: ${intention || "none"}
Detail: ${detail || "none"}

Persona:
${persona}

Style:
${styleHints}

Constraints:
- 5 to 9 short lines
- Whispered tone, intimate, gentle
- Evoke sensations, not explanations
- First person or very close presence`
    : `Écris un murmure poétique pour ${prenom}.

Thème : ${theme || "non précisé"}
Sous-thème : ${sousTheme || "non précisé"}
Intention : ${intention || "aucune"}
Détail : ${detail || "aucun"}

Persona :
${persona}

Style :
${styleHints}

Contraintes :
- 5 à 9 lignes courtes
- Ton murmuré, intime, doux
- Évoquer des sensations, pas expliquer
- Première personne ou présence très proche`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
    throw new Error("Erreur API OpenAI: " + resp.status);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ─────────────────────────────────────────────
//  IA AUDIO (OpenAI TTS)
// ─────────────────────────────────────────────
async function generateWhisperAudio(texte, ctx) {
  const voiceName = pickVoice(ctx);

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: voiceName,
      input: texte
    })
  });

  if (!resp.ok) throw new Error("Erreur TTS: " + resp.status);

  const buffer = Buffer.from(await resp.arrayBuffer());
  return `data:audio/mp3;base64,${buffer.toString("base64")}`;
}

// ─────────────────────────────────────────────
//  VOIX selon thème + choix client
// ─────────────────────────────────────────────
function pickVoice({ voix, theme }) {
  const t = (theme || "").toLowerCase();
  const v = (voix || "").toLowerCase();

  const fem = v.includes("fem");
  const masc = v.includes("mas");

  // Amour → voix plus chaude
  if (t.includes("amour") || t.includes("love")) {
    if (fem) return "nova";
    if (masc) return "onyx";
    return "nova";
  }

  // Guérison
  if (t.includes("guérison") || t.includes("healing")) {
    if (fem) return "fable";
    if (masc) return "alloy";
    return "fable";
  }

  // Nuit
  if (t.includes("rêves") || t.includes("night")) {
    if (fem) return "fable";
    if (masc) return "echo";
    return "alloy";
  }

  // Par défaut
  if (fem) return "nova";
  if (masc) return "onyx";
  return "alloy";
}

// ─────────────────────────────────────────────
//  Fallback texte (si pas d'IA)
// ─────────────────────────────────────────────
function generateFallbackWhisper({ langue, prenom, theme, sousTheme }) {
  if (langue === "en") {
    return (
      `“${prenom}, a soft whisper rises from the heart of the wood.` +
      (theme ? ` It carries a note of ${theme}.` : "") +
      (sousTheme ? ` More precisely: ${sousTheme}.` : "") +
      ` Each time you call this jewel, it remembers you.”`
    );
  }

  return (
    `« ${prenom}, un murmure s’élève du cœur du bois.` +
    (theme ? ` Il porte une nuance de ${theme}.` : "") +
    (sousTheme ? ` Plus précisément : ${sousTheme}.` : "") +
    ` À chaque fois que tu appelles ce bijou, il se souvient de toi. »`
  );
}
