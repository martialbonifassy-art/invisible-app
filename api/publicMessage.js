// api/publicMessage.js
//
// Endpoint PUBLIC pour générer un murmure à partir d'un public_id.
// Utilisé par b.html (lecture côté client final).
//
// - récupère le bijou via public_id
// - vérifie : configuré / locked / messages_restants
// - génère un texte IA (GPT-4.1-mini) adapté au thème + langue
// - génère un audio TTS (OpenAI) → data:audio/mp3;base64,...
// - décrémente messages_restants + met à jour date_dernier_murmure

import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────
// Supabase
// ─────────────────────────────────────

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────
// OpenAI
// ─────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function hasOpenAIKey() {
  return typeof OPENAI_API_KEY === "string" && OPENAI_API_KEY.trim().length > 0;
}

// ─────────────────────────────────────
// Petite aide : choisir la voix TTS
// ─────────────────────────────────────

function pickVoiceName({ voix, theme, langue }) {
  const t = (theme || "").toLowerCase();
  const v = (voix || "neutre").toLowerCase();
  const lang = (langue || "fr").toLowerCase();

  const isFem =
    v === "feminine" ||
    v === "féminine" ||
    v === "feminin" ||
    v === "féminin";
  const isMasc = v === "masculine" || v === "masculin";

  // Pour la logique, on garde quelque chose de simple et cohérent
  if (lang === "fr") {
    if (isFem) return "nova";
    if (isMasc) return "onyx";
    return "alloy";
  } else {
    if (isFem) return "nova";
    if (isMasc) return "onyx";
    return "alloy";
  }
}

// ─────────────────────────────────────
// IA : texte poétique (avec sensualité élégante possible)
// ─────────────────────────────────────

async function generatePoeticWhisperWithOpenAI({
  langue,
  prenom,
  theme,
  sous_theme,
  intention,
  detail,
}) {
  const isEn = (langue || "").toLowerCase() === "en";
  const name = prenom || (isEn ? "you" : "toi");
  const themeLower = (theme || "").toLowerCase();
  const sousLower = (sous_theme || "").toLowerCase();

  const hasSensualFlavor =
    themeLower.includes("sensual") ||
    themeLower.includes("sensualité") ||
    sousLower.includes("sensual") ||
    sousLower.includes("sensualité") ||
    sousLower.includes("complice");

  const system = isEn
    ? "You are a gentle, poetic voice living inside a wooden jewel. You write short, intimate whispers (5 to 9 short lines), in a soft, emotional, delicate style. You never mention that you are an AI or that this is a message or a text. You speak as if the jewel itself were addressing the person."
    : "Tu es une voix douce et poétique qui habite dans un bijou en bois. Tu écris de courts murmures intimes (entre 5 et 9 lignes courtes), dans un style délicat, sensible et chaleureux. Tu ne mentionnes jamais que tu es une IA, ni que ceci est un message ou un texte. Tu parles comme si le bijou lui-même s’adressait à la personne.";

  const sensualBlockEn = `
If the theme or sub-theme suggests sensuality or complicity (for example: “Sensualité complice”), your tone can be warm, elegant and suggestive, but never vulgar or explicit. You evoke touch, closeness, warmth, breath, but you avoid explicit sexual content.`;
  const sensualBlockFr = `
Si le thème ou le sous-thème évoque la sensualité ou une complicité amoureuse (par exemple : « Sensualité complice »), ton ton peut être chaleureux, élégant et suggestif, mais jamais vulgaire ni explicite. Tu évoques le toucher, la proximité, la chaleur, le souffle, mais tu évites tout contenu sexuel explicite.`;

  const userPrompt = isEn
    ? `Write a poetic whisper for ${name}.

Main theme: ${theme || "not specified"}
Sub-theme: ${sous_theme || "not specified"}
Intention or situation: ${intention || "not specified"}
Detail or memory to weave in: ${detail || "none"}

Style:
- 5 to 9 short lines (line breaks welcome)
- intimate, soft, poetic, sensory
- speak in the first person as the jewel or a very close presence
- no emojis
${
  hasSensualFlavor
    ? sensualBlockEn
    : "If the theme is not sensual, you keep a gentle, emotional tone without focusing on the body."
}
Transform all of this into a single organic text, without bullet points.`
    : `Écris un murmure poétique pour ${name}.

Thème principal : ${theme || "non précisé"}
Sous-thème : ${sous_theme || "non précisé"}
Intention ou situation : ${intention || "non précisé"}
Détail ou souvenir à tisser : ${detail || "aucun"}

Style :
- entre 5 et 9 lignes courtes (retours à la ligne bienvenus)
- intime, doux, poétique, sensoriel
- le bijou parle à la première personne ou comme une présence très proche
- pas d’emojis
${
  hasSensualFlavor
    ? sensualBlockFr
    : "Si le thème n’est pas sensuel, tu gardes un ton tendre et émotionnel sans insister sur le corps."
}
Transforme tout cela en un seul texte organique, sans puces.`;

  const body = {
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.95,
    max_tokens: 400,
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

// Fallback simple si pas de clé ou erreur IA
function genererMurmureSimple({ langue, prenom, theme, sous_theme, intention, detail }) {
  const nom = prenom || (langue === "en" ? "you" : "toi");

  if (langue === "en") {
    let base = `"${nom}, this whisper rises from the heart of the wood.`;
    if (theme) base += ` It carries a shade of ${theme}.`;
    if (sous_theme) base += ` More precisely: ${sous_theme}.`;
    if (intention) base += `\n\nWhat wants to be said today is: ${intention}.`;
    if (detail) base += `\n\nIn the background, there is this memory: ${detail}.`;
    base += `\n\nEach time you call this jewel, it remembers you and answers in its own way."`;
    return base;
  }

  let base = `« ${nom}, ce murmure s’élève du cœur du bois.`;
  if (theme) base += ` Il porte une nuance de ${theme}.`;
  if (sous_theme) base += ` Plus précisément : ${sous_theme}.`;
  if (intention) base += `\n\nCe qui cherche à se dire aujourd’hui, c’est ${intention}.`;
  if (detail) base += `\n\nEn filigrane, il y a ce souvenir : ${detail}.`;
  base += `\n\nÀ chaque fois que tu appelles ce bijou, il se souvient de toi et répond à sa manière. »`;
  return base;
}

// ─────────────────────────────────────
// IA : audio TTS OpenAI
// ─────────────────────────────────────

async function generateSpeechFromText({ texte, langue, voix, theme }) {
  if (!texte || !OPENAI_API_KEY) return null;

  const voiceName = pickVoiceName({ voix, theme, langue });

  const body = {
    model: "tts-1",
    voice: voiceName,
    input: texte,
  };

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

// ─────────────────────────────────────
// Handler principal
// ─────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée. Utilisez GET." });
  }

  try {
    const { public_id } = req.query || {};

    if (!public_id) {
      return res.status(400).json({ error: "Paramètre public_id manquant." });
    }

    // 1) Récupérer le bijou via public_id
    const { data: bijou, error: fetchError } = await supabase
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
        locked,
        etat,
        date_dernier_murmure
      `
      )
      .eq("public_id", public_id)
      .maybeSingle();

    if (fetchError) {
      console.error("Erreur Supabase publicMessage:", fetchError);
      return res
        .status(500)
        .json({ error: "Erreur de connexion à la base de données." });
    }

    if (!bijou) {
      return res.status(404).json({
        error: "Bijou introuvable pour ce code public.",
      });
    }

    const langue = (bijou.langue || "fr").toLowerCase();
    const isEn = langue === "en";

    // 2) Vérifications d'état
    const etat = (bijou.etat || "").toLowerCase();
    const locked = bijou.locked === true;
    const messagesRestants =
      typeof bijou.messages_restants === "number"
        ? bijou.messages_restants
        : null;

    const estNonConfigure =
      etat.includes("non") && etat.includes("configur");

    if (estNonConfigure || !bijou.theme || !bijou.sous_theme || !bijou.prenom) {
      const text = isEn
        ? "This jewel has been created at the workshop, but its whisper has not yet been written. Please ask the Atelier des Liens Invisibles to configure it."
        : "Ce bijou a bien été créé à l’atelier, mais son murmure n’a pas encore été écrit. Merci de demander à l’Atelier des Liens Invisibles de le configurer.";
      return res.status(200).json({
        ok: true,
        id: bijou.id,
        public_id,
        langue,
        text,
        audio: null,
        messages_restants: messagesRestants,
      });
    }

    if (locked) {
      const text = isEn
        ? "This jewel has completed its cycle of whispers. It now remains silently close to you."
        : "Ce bijou a terminé son cycle de murmures. Il reste désormais silencieux, tout près de vous.";
      return res.status(200).json({
        ok: true,
        id: bijou.id,
        public_id,
        langue,
        text,
        audio: null,
        messages_restants: messagesRestants,
      });
    }

    if (messagesRestants !== null && messagesRestants <= 0) {
      const text = isEn
        ? "All the whispers for this jewel have been used. Please contact the Atelier des Liens Invisibles if you wish to recharge it."
        : "Tous les murmures de ce bijou ont été utilisés. Merci de contacter l’Atelier des Liens Invisibles si vous souhaitez le recharger.";
      return res.status(200).json({
        ok: true,
        id: bijou.id,
        public_id,
        langue,
        text,
        audio: null,
        messages_restants: messagesRestants,
      });
    }

    // 3) Contexte pour l'IA
    const prenom = bijou.prenom || "";
    const intention = bijou.intention || "";
    const detail = bijou.detail || "";
    const theme = bijou.theme || "";
    const sous_theme = bijou.sous_theme || "";
    const voix = (bijou.voix || "neutre").toLowerCase();

    // 4) Génération du texte IA
    let texte;

    if (hasOpenAIKey()) {
      try {
        texte = await generatePoeticWhisperWithOpenAI({
          langue,
          prenom,
          theme,
          sous_theme,
          intention,
          detail,
        });
      } catch (err) {
        console.error("Erreur OpenAI texte publicMessage, fallback simple:", err);
        texte = genererMurmureSimple({
          langue,
          prenom,
          theme,
          sous_theme,
          intention,
          detail,
        });
      }
    } else {
      texte = genererMurmureSimple({
        langue,
        prenom,
        theme,
        sous_theme,
        intention,
        detail,
      });
    }

    // 5) Mise à jour du compteur / date
    const nowIso = new Date().toISOString();
    let nouveauSolde = messagesRestants;
    if (messagesRestants !== null) {
      nouveauSolde = Math.max(messagesRestants - 1, 0);
    }

    const { error: updateError } = await supabase
      .from("bijous")
      .update({
        messages_restants: nouveauSolde,
        date_dernier_murmure: nowIso,
      })
      .eq("public_id", public_id);

    if (updateError) {
      console.error(
        "Erreur update messages_restants/date_dernier_murmure:",
        updateError
      );
      // on laisse quand même passer le murmure
    }

    // 6) Génération de l’audio (si possible)
    let audioDataUrl = null;
    if (hasOpenAIKey()) {
      try {
        audioDataUrl = await generateSpeechFromText({
          texte,
          langue,
          voix,
          theme,
        });
      } catch (err) {
        console.error("Erreur OpenAI audio publicMessage:", err);
        audioDataUrl = null;
      }
    }

    // 7) Réponse finale
    return res.status(200).json({
      ok: true,
      id: bijou.id,
      public_id,
      langue,
      text: texte,
      audio: audioDataUrl,
      messages_restants: nouveauSolde,
    });
  } catch (e) {
    console.error("Erreur interne /api/publicMessage:", e);
    return res.status(500).json({
      error: "Erreur interne du serveur.",
    });
  }
}
