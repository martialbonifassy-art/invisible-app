// api/publicMessage.js
//
// Lecture "publique" d'un murmure pour un bijou identifié par public_id (ou id)
// - Génère un texte poétique (FR ou EN) selon le paramètre ?lang=fr|en
// - Génère un audio mp3 (TTS) si OPENAI_API_KEY est configurée
// - Ne modifie PAS la base (pas de décrément, pas de date_dernier_murmure).
//
// Réponse typique :
// { ok: true, id, public_id, langue, text, audio }

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Clé OpenAI dans les variables d'env Vercel (OPENAI_API_KEY)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function hasOpenAIKey() {
  return typeof OPENAI_API_KEY === "string" && OPENAI_API_KEY.trim().length > 0;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
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
      .limit(1);

    if (public_id) {
      query.eq("public_id", public_id);
    } else {
      query.eq("id", id);
    }

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
          "Ce bijou n’est pas encore relié à sa voix. Contactez l’atelier si cela vous semble anormal."
      });
    }

    // ─────────────────────────────────────
    // 2) Langue effective : priorité au paramètre ?lang=
    // ─────────────────────────────────────
    const langueFromDb = (bijou.langue || "").toLowerCase();
    const langFromReq = (langParam || "").toLowerCase();
    const langue = (langFromReq || langueFromDb || "fr").toLowerCase();
    const isEn = langue === "en";

    // ─────────────────────────────────────
    // 3) Cas : bijou non configuré / verrouillé
    // ─────────────────────────────────────
    const etat = (bijou.etat || "").toLowerCase();
    const locked = bijou.locked === true;

    const estNonConfigure = etat.includes("non") && etat.includes("configur");

    if (estNonConfigure) {
      const text = isEn
        ? "This jewel has been created, but its whisper has not yet been written. Ask the artisan to personalize it, or use the dedicated page to configure it."
        : "Ce bijou a bien été créé, mais son murmure n’a pas encore été écrit. Demandez à l’atelier de le personnaliser, ou utilisez la page de personnalisation dédiée.";
      return res.status(200).json({
        ok: true,
        id: bijou.id,
        public_id: bijou.public_id,
        langue,
        text,
        audio: null
      });
    }

    if (locked) {
      const text = isEn
        ? "This jewel has completed its cycle of whispers. It now keeps silent, but remains close."
        : "Ce bijou a terminé son cycle de murmures. Il reste silencieux désormais, mais tout près de vous.";
      return res.status(200).json({
        ok: true,
        id: bijou.id,
        public_id: bijou.public_id,
        langue,
        text,
        audio: null
      });
    }

    // ─────────────────────────────────────
    // 4) Préparation du contexte pour le murmure
    // ─────────────────────────────────────
    const prenom = bijou.prenom || (isEn ? "you" : "toi");
    const theme = bijou.theme || "";
    const sousTheme = bijou.sous_theme || "";
    const intention = bijou.intention || "";
    const detail = bijou.detail || "";
    const voix = (bijou.voix || "neutre").toLowerCase();

    // ─────────────────────────────────────
    // 5) Générer le texte (IA ou fallback simple)
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
        console.error("Erreur OpenAI texte, fallback simple:", err);
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
    // 6) Génération de l’audio TTS (facultative)
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
        console.error("Erreur OpenAI audio (publicMessage):", err);
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
      message: "Erreur interne sur le serveur."
    });
  }
}

// ─────────────────────────────────────────
// Aide : style selon le thème
// ─────────────────────────────────────────
function getThemeStyleHints(theme, sousTheme, langue) {
  const t = (theme || "").toLowerCase();
  const isEn = langue === "en";
  const EN = (fr, en) => (isEn ? en : fr);

  // AMOUR
  if (t.includes("amour") || t.includes("love")) {
    return EN(
      "Style : très intime, tendre, presque chuchoté à l’oreille. Décris des gestes simples, des souvenirs partagés, des petits détails qui n’appartiennent qu’à eux. Le ton est vulnérable, sincère, sans ironie.",
      "Style: very intimate and tender, almost whispered into the ear. Describe simple gestures, shared memories and small details that belong only to them. The tone is vulnerable, sincere and without irony."
    );
  }

  // GRATITUDE
  if (t.includes("gratitude") || t.includes("remerci")) {
    return EN(
      "Style : reconnaissant, chaleureux, centré sur le ‘merci’ incarné. Mets en lumière les gestes discrets, les présences silencieuses, les soutiens qui ont compté.",
      "Style: warm and thankful, centered on embodied ‘thank you’. Highlight discreet gestures, silent presences and support that truly mattered."
    );
  }

  // GUÉRISON & APAISEMENT
  if (t.includes("guérison") || t.includes("guerison") || t.includes("apaisement") || t.includes("healing")) {
    return EN(
      "Style : très doux, enveloppant, comme une main posée sur l’épaule. Phrases un peu plus lentes, respiration calme, répétitions légères qui bercent.",
      "Style: very soft and soothing, like a hand resting on the shoulder. Sentences a bit slower, calm breathing, gentle repetitions that cradle."
    );
  }

  // SENSUALITÉ COMPLICE (sexy, mais classe)
  if (t.includes("amour") && sousTheme && sousTheme.toLowerCase().includes("sensual")) {
    return EN(
      "Style : sensuel, élégant et pudique. Tu évoques la proximité des corps, les frôlements, la chaleur de la peau, mais toujours avec tact et poésie, sans vulgarité.",
      "Style: sensual, elegant and discreet. You evoke the closeness of bodies, brushes of skin and warmth, always with tact and poetry, never vulgar."
    );
  }

  // Rêves & nuit
  if (t.includes("rêves") || t.includes("reves") || t.includes("nuit") || t.includes("night")) {
    return EN(
      "Style : nocturne, doux, presque chuchoté à la lueur d’une veilleuse. Images de nuit calme, ciel profond, constellations, brume légère.",
      "Style: nocturnal, gentle, almost whispered in dim light. Images of calm night, deep sky, constellations and soft mist."
    );
  }

  // par défaut
  return EN(
    "Style : intime, doux, poétique, avec quelques images liées au bois, au souffle et à la lumière.",
    "Style: intimate, soft and poetic, with a few images related to wood, breath and light."
  );
}

// ─────────────────────────────────────────
// Persona
// ─────────────────────────────────────────
function getThemePersona(langue, theme, sousTheme) {
  const t = (theme || "").toLowerCase();
  const isEn = langue === "en";
  const EN = (fr, en) => (isEn ? en : fr);

  if (t.includes("amour") || t.includes("love")) {
    return EN(
      "Tu parles comme si tu connaissais intimement la personne aimée et la relation, avec beaucoup de tact. Tu respectes la pudeur : tu n’es jamais vulgaire ni trop explicite.",
      "You speak as if you know the beloved person and the relationship intimately, with great tact. You respect modesty: you are never vulgar or too explicit."
    );
  }

  if (t.includes("guérison") || t.includes("guerison") || t.includes("apaisement") || t.includes("healing")) {
    return EN(
      "Tu parles comme une couverture posée sur les épaules : tu ne donnes pas de leçons, tu offres un refuge.",
      "You speak like a blanket placed over the shoulders: you do not teach lessons, you offer refuge."
    );
  }

  if (t.includes("rêves") || t.includes("reves") || t.includes("nuit") || t.includes("night")) {
    return EN(
      "Tu parles comme une berceuse murmurée entre veille et sommeil.",
      "You speak like a lullaby whispered between waking and sleep."
    );
  }

  return EN(
    "Tu parles comme une présence attentive et bienveillante qui vit dans le bijou, avec un ton simple et humain.",
    "You speak like a caring, attentive presence living inside the jewel, with a simple and human tone."
  );
}

// ─────────────────────────────────────────
// Génération IA
// ─────────────────────────────────────────
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
    ? "You are a gentle, poetic voice living inside a wooden jewel. You write short, intimate whispers (5 to 9 short lines), in a soft, emotional and delicate style. You never mention that you are an AI, nor that this is a message or a text. You speak as if the jewel itself were addressing the person."
    : "Tu es une voix douce et poétique qui habite dans un bijou en bois. Tu écris de courts murmures intimes (entre 5 et 9 lignes courtes), dans un style délicat, sensible et chaleureux. Tu ne mentionnes jamais que tu es une IA, ni que ceci est un message ou un texte. Tu parles comme si le bijou lui-même s’adressait à la personne.";

  const userPrompt = isEn
    ? `Write a poetic whisper for ${name}.

Context:
- Main theme: ${theme || "not specified"}
- Sub-theme: ${sousTheme || "not specified"}
- Intention or situation: ${intention || "not specified"}
- Detail or memory to weave in: ${detail || "none"}

Voice persona:
${persona}

Style guidance:
${styleHints}

Constraints:
- Tone: intimate, gentle, soft, with emotional depth.
- 5 to 9 short lines.
- The jewel speaks in the first person or as a very close presence.
- Avoid explaining, prefer evoking with concrete and sensory images.`
    : `Écris un murmure poétique pour ${name}.

Contexte :
- Thème principal : ${theme || "non précisé"}
- Sous-thème : ${sousTheme || "non précisé"}
- Intention ou situation : ${intention || "non précisé"}
- Détail ou souvenir à tisser : ${detail || "aucun"}

Persona de la voix :
${persona}

Style :
${styleHints}

Contraintes :
- Ton : intime, doux, avec de la profondeur émotionnelle.
- Entre 5 et 9 lignes courtes.
- Le bijou parle à la première personne ou comme une présence très proche.
- Évite d’expliquer ; privilégie les images concrètes et sensorielles.`;

  const body = {
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.95,
    max_tokens: 400
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(
      `Erreur OpenAI chat (${resp.status}): ${errText.slice(0, 200)}`
    );
  }

  const data = await resp.json();
  const content =
    data.choices?.[0]?.message?.content?.trim() ||
    (isEn
      ? "I am here, silently, but present for you."
      : "Je suis là, silencieux, mais présent pour toi.");
  return content;
}

// ─────────────────────────────────────────
// Fallback simple
// ─────────────────────────────────────────
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
    let base = `“${capitalizeFirst(
      nom
    )}, this whisper rises from the heart of the wood.`;

    if (theme) base += ` It carries a shade of ${theme}.`;
    if (sousTheme) base += ` More precisely: ${sousTheme}.`;
    if (intention) base += `\n\nWhat wants to be said today is: ${intention}.`;
    if (detail) base += `\n\nIn the background, there is this memory: ${detail}.`;
    base += `\n\nEach time you call this jewel, it remembers you and answers in its own way.”`;
    return base;
  }

  let base = `« ${capitalizeFirst(
    nom
  )}, ce murmure s’élève du cœur du bois.`;

  if (theme) {
    const t = theme.trim();
    const lower = t.toLowerCase();
    const startsWithVowel = /^[aeiouyhàâäáãéèêëîïíìôöóòúùûü]/i.test(lower);
    const prep = startsWithVowel ? "d’" : "de ";
    base += ` Il porte une nuance ${prep}${t}.`;
  }
  if (sousTheme) base += ` Plus précisément : ${sousTheme}.`;
  if (intention)
    base += `\n\nCe qui cherche à se dire aujourd’hui, c’est ${intention}.`;
  if (detail)
    base += `\n\nEn filigrane, il y a ce souvenir : ${detail}.`;
  base += `\n\nÀ chaque fois que tu appelles ce bijou, il se souvient de toi et répond à sa manière. »`;
  return base;
}

function capitalizeFirst(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─────────────────────────────────────────
// Choix de la voix TTS
// ─────────────────────────────────────────
function pickVoiceName({ voix, theme }) {
  const t = (theme || "").toLowerCase();
  const v = (voix || "neutre").toLowerCase();

  const isFem =
    v === "feminine" ||
    v === "féminine" ||
    v === "feminin" ||
    v === "féminin";
  const isMasc = v === "masculine" || v === "masculin";

  if (t.includes("amour") || t.includes("love")) {
    if (isMasc) return "onyx";
    if (isFem) return "nova";
    return "nova";
  }

  if (t.includes("guérison") || t.includes("guerison") || t.includes("healing")) {
    if (isFem) return "fable";
    if (isMasc) return "alloy";
    return "fable";
  }

  if (t.includes("rêves") || t.includes("reves") || t.includes("nuit") || t.includes("night")) {
    if (isFem) return "fable";
    if (isMasc) return "echo";
    return "alloy";
  }

  if (isFem) return "nova";
  if (isMasc) return "onyx";
  return "alloy";
}

// ─────────────────────────────────────────
// Génération audio TTS
// ─────────────────────────────────────────
async function generateSpeechFromText({ texte, langue, voix, theme }) {
  if (!texte || !OPENAI_API_KEY) return null;

  const voiceName = pickVoiceName({ voix, theme });

  const body = {
    model: "tts-1",
    voice: voiceName,
    input: texte
  };

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(
      `Erreur OpenAI audio (${resp.status}): ${errText.slice(0, 200)}`
    );
  }

  const arrayBuffer = await resp.arrayBuffer();
  const base64Audio = Buffer.from(arrayBuffer).toString("base64");
  return `data:audio/mp3;base64,${base64Audio}`;
}
