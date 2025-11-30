// api/previewMessage.js
//
// Petit endpoint dédié à la PRÉVISUALISATION d'un murmure.
// - Ne touche pas Supabase
// - Ne décrémente aucun compteur
// - Utilise OpenAI si la clé est dispo, sinon un générateur simple
//
// Appelé par personnalisation.html & personnalisation-en.html
// avec: prenom, intention, detail, theme, sous_theme, voix, lang

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function hasOpenAIKey() {
  return typeof OPENAI_API_KEY === "string" && OPENAI_API_KEY.trim().length > 0;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const {
      prenom = "",
      intention = "",
      detail = "",
      theme = "",
      sous_theme: sousTheme = "",
      voix = "neutre",
      lang = "fr"
    } = req.query || {};

    const langue = (lang || "fr").toLowerCase();

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
        console.error("Erreur OpenAI preview, fallback simple:", err);
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

    return res.status(200).json({
      text: texte,
      audio: null  // pas d'audio pour la prévisualisation
    });
  } catch (e) {
    console.error("Erreur interne /api/previewMessage:", e);
    return res.status(200).json({
      text:
        langue === "en"
          ? "I am here, silently, but present for you. (Internal error.)"
          : "Je suis là, silencieux, mais présent pour toi. (Erreur interne.)",
      audio: null
    });
  }
}

// ─────────────────────────────────────────
// Helpers repris de message.js (version simplifiée)
// ─────────────────────────────────────────

function getThemeStyleHints(theme, sousTheme, langue) {
  const t = (theme || "").toLowerCase();
  const isEn = langue === "en";
  const EN = (fr, en) => (isEn ? en : fr);

  if (t.includes("amour")) {
    return EN(
      "Style : très intime, tendre, presque chuchoté à l’oreille.",
      "Style: very intimate and tender, almost whispered into the ear."
    );
  }

  if (t.includes("guérison") || t.includes("guerison") || t.includes("apaisement")) {
    return EN(
      "Style : très doux, enveloppant, comme une main posée sur l’épaule.",
      "Style: very soft and soothing, like a hand resting on the shoulder."
    );
  }

  if (t.includes("rêves") || t.includes("reves") || t.includes("nuit")) {
    return EN(
      "Style : nocturne, doux, presque chuchoté à la lueur d’une veilleuse.",
      "Style: nocturnal, gentle, almost whispered in dim light."
    );
  }

  if (t.includes("gardien") || t.includes("bois")) {
    return EN(
      "Style : légèrement archaïque et naturel, comme une présence ancienne du bois.",
      "Style: slightly ancient and natural, like an old presence of the wood."
    );
  }

  // par défaut
  return EN(
    "Style : intime, doux, poétique, avec quelques images liées au bois, au souffle et à la lumière.",
    "Style: intimate, soft and poetic, with a few images related to wood, breath and light."
  );
}

function getThemePersona(langue, theme, sousTheme) {
  const t = (theme || "").toLowerCase();
  const isEn = langue === "en";
  const EN = (fr, en) => (isEn ? en : fr);

  if (t.includes("amour")) {
    return EN(
      "Tu parles comme si tu connaissais intimement la personne aimée, avec beaucoup de tact.",
      "You speak as if you know the beloved person very well, with great tact."
    );
  }

  if (t.includes("guérison") || t.includes("guerison") || t.includes("apaisement")) {
    return EN(
      "Tu parles comme une couverture posée sur les épaules : tu offres un refuge.",
      "You speak like a blanket on the shoulders: you offer refuge."
    );
  }

  if (t.includes("rêves") || t.includes("reves") || t.includes("nuit")) {
    return EN(
      "Tu parles comme une berceuse murmurée entre veille et sommeil.",
      "You speak like a lullaby whispered between waking and sleep."
    );
  }

  if (t.includes("gardien") || t.includes("bois")) {
    return EN(
      "Tu parles comme un esprit ancien du bois qui a vu passer des générations.",
      "You speak like an ancient spirit of the wood that has seen generations pass."
    );
  }

  return EN(
    "Tu parles comme une présence attentive et bienveillante qui vit dans le bijou.",
    "You speak like a caring, attentive presence living inside the jewel."
  );
}

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
    ? "You are a gentle, poetic voice living inside a wooden jewel. You write short, intimate whispers (5 to 9 short lines)."
    : "Tu es une voix douce et poétique qui habite dans un bijou en bois. Tu écris de courts murmures intimes (entre 5 et 9 lignes courtes).";

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
- 5 to 9 short lines.
- The jewel speaks in the first person or as a very close presence.`
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
- Entre 5 et 9 lignes courtes.
- Le bijou parle à la première personne ou comme une présence très proche.`;

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
    throw new Error(`Erreur OpenAI chat (${resp.status}): ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content =
    data.choices?.[0]?.message?.content?.trim() ||
    (isEn ? "I am here, silently, but present for you." : "Je suis là, silencieux, mais présent pour toi.");
  return content;
}

function genererMurmureSimple({
  langue,
  prenom,
  intention,
  detail,
  theme,
  sousTheme,
  voix
}) {
  const nom = prenom || (langue === "en" ? "you" : "toi");

  if (langue === "en") {
    let base = `“${capitalizeFirst(nom)}, this whisper rises from the heart of the wood.`;

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
  if (intention) base += `\n\nCe qui cherche à se dire aujourd’hui, c’est ${intention}.`;
  if (detail) base += `\n\nEn filigrane, il y a ce souvenir : ${detail}.`;

  base += `\n\nÀ chaque fois que tu appelles ce bijou, il se souvient de toi et répond à sa manière. »`;
  return base;
}

function capitalizeFirst(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
