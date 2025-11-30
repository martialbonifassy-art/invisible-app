// api/publicMessage.js
//
// Endpoint PUBLIC pour générer un murmure à partir d'un public_id.
// Utilisé par b.html (client final).
//
// - récupère le bijou via public_id
// - vérifie : configuré / locked / messages_restants
// - génère un texte IA (GPT-4.1) adapté au thème + langue
// - génère un audio TTS (OpenAI) → data:audio/mp3;base64,...
// - décrémente messages_restants + met à jour date_dernier_murmure

import { supabase } from "../../utils/supabaseClient";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─────────────────────────────────────
// Aide : prompt IA pour le texte
// ─────────────────────────────────────

async function generateWhisperIA({ langue, prenom, theme, sous_theme, intention, detail }) {
  const isEn = (langue || "").toLowerCase() === "en";

  const prompt = isEn
    ? `
You are a poetic, intimate voice living inside a wooden jewel.
You write a short whisper (5 to 9 short lines), warm, sensory and elegant.

Recipient: ${prenom || "you"}
Main theme: ${theme || "not specified"}
Sub-theme: ${sous_theme || "not specified"}
User intention: ${intention || "none"}
Detail or memory to weave in: ${detail || "none"}

Tone rules:
- poetic but never cliché
- emotional but never needy
- warm, sensory, subtle
- if the sub-theme or theme suggests sensuality (e.g. "Sensualité complice"):
  → sensual, elegant, suggestive, never vulgar, no explicit sexual content
- never use emojis
- you do not mention that you are an AI or that this is a “message”
- you speak as if the jewel itself were addressing the person
`
    : `
Tu es une voix poétique et intime qui habite dans un bijou en bois.
Tu écris un murmure court (entre 5 et 9 lignes courtes), chaleureux, sensoriel et élégant.

Destinataire : ${prenom || "toi"}
Thème principal : ${theme || "non précisé"}
Sous-thème : ${sous_theme || "non précisé"}
Intention : ${intention || "aucune"}
Détail ou souvenir à tisser : ${detail || "aucun"}

Règles de ton :
- poétique mais jamais cliché
- émotionnel mais jamais plaintif
- sensoriel, subtil, chaleureux
- si le thème ou sous-thème évoque la sensualité (ex : "Sensualité complice") :
  → style sensuel, élégant, suggestif, mais jamais vulgaire ni explicite
- pas d’emojis
- tu ne mentionnes pas que tu es une IA ni que ceci est un “message”
- tu parles comme si le bijou lui-même s’adressait à la personne
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.9,
    max_tokens: 400,
  });

  const content =
    response.choices?.[0]?.message?.content?.trim() ||
    (isEn
      ? "I am here, silently, but present for you."
      : "Je suis là, silencieux, mais présent pour toi.");

  return content;
}

// ─────────────────────────────────────
// Aide : voix TTS selon langue + voix
// ─────────────────────────────────────

function pickVoiceName(langue, voix) {
  const lang = (langue || "fr").toLowerCase();
  const v = (voix || "neutre").toLowerCase();

  // Map très simple, à ajuster selon les voix OpenAI dispo
  if (lang === "fr") {
    if (v.includes("fem")) return "sophie";   // imaginaire – à adapter si besoin
    if (v.includes("masc")) return "antoine";
    return "sophie";
  } else {
    if (v.includes("fem")) return "alloy";
    if (v.includes("masc")) return "onyx";
    return "alloy";
  }
}

async function generateAudioIA({ texte, langue, voix }) {
  if (!texte) return null;

  const voiceName = pickVoiceName(langue, voix);

  const resp = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: voiceName,
    input: texte,
    format: "mp3",
  });

  const buffer = Buffer.from(await resp.arrayBuffer());
  const base64 = buffer.toString("base64");
  return `data:audio/mp3;base64,${base64}`;
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

    // 1) Récupérer le bijou
    const { data: bijou, error: fetchError } = await supabase
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

    // Bijou non configuré
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

    // Bijou verrouillé
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

    // Plus de murmures
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

    // 3) Génération du texte IA
    let texte;
    try {
      texte = await generateWhisperIA({
        langue,
        prenom: bijou.prenom,
        theme: bijou.theme,
        sous_theme: bijou.sous_theme,
        intention: bijou.intention,
        detail: bijou.detail,
      });
    } catch (err) {
      console.error("Erreur génération texte IA publicMessage:", err);
      texte = isEn
        ? "I am here, silently, but present for you."
        : "Je suis là, silencieux, mais présent pour toi.";
    }

    // 4) Génération de l’audio IA
    let audioDataUrl = null;
    try {
      audioDataUrl = await generateAudioIA({
        texte,
        langue,
        voix: bijou.voix || "neutre",
      });
    } catch (err) {
      console.error("Erreur génération audio IA publicMessage:", err);
      audioDataUrl = null;
    }

    // 5) Mise à jour du compteur et de la date
    const nowIso = new Date().toISOString();
    let nouveauSolde = messagesRestants;
    if (messagesRestants !== null) {
      nouveauSolde = Math.max(messagesRestants - 1, 0);
    }

    const { error: updateError } = await supabase
      .from("bijoux")
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
      // On ne bloque pas la réponse au client pour autant
    }

    // 6) Réponse finale
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
