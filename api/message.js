import { supabase } from "../../utils/supabaseClient";
import OpenAI from "openai";

// --- Client OpenAI ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Génération du texte du murmure via GPT ---
async function generateWhisperIA({ langue, prenom, theme, sous_theme, intention, detail }) {
  const prompt =
    langue === "en"
      ? `
You are an AI writing intimate poetic whispers linked to wooden objects.
Write a short message (3–5 lines), warm, sensory and elegant.

Recipient: ${prenom}
Theme: ${theme}
Sub-theme: ${sous_theme}
User intention: ${intention || "None"}
Detail to weave in: ${detail || "None"}

Tone rules:
• poetic but never cliché
• emotional but never needy
• sensory, warm, subtle
• for "Sensualité complice": sensual, elegant, suggestive, never vulgar
• never use emojis
`
      : `
Tu es une IA qui écrit des murmures intimes et poétiques liés à un bijou en bois.
Rédige un court murmure (3–5 lignes), doux, sensoriel et élégant.

Destinataire : ${prenom}
Thème : ${theme}
Sous-thème : ${sous_theme}
Intention : ${intention || "Aucune"}
Détail à intégrer : ${detail || "Aucun"}

Règles de ton :
• poétique mais jamais cliché
• émotionnel mais jamais plaintif
• sensoriel, subtil, chaleureux
• pour "Sensualité complice" : sensuel, élégant, suggestif, jamais vulgaire
• pas d’emojis
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.85,
  });

  return response.choices[0].message.content.trim();
}

// --- Générer l'audio TTS ---
async function generateAudioIA(text, langue, voix) {
  // correspondances simples de voix OpenAI
  const VOICE_MAP = {
    fr: {
      feminine: "sophie",
      masculine: "antoine",
      neutre: "marie",
    },
    en: {
      feminine: "alloy",
      masculine: "verse",
      neutre: "alloy",
    },
  };

  const chosenVoice =
    VOICE_MAP[langue]?.[voix] || VOICE_MAP[langue]?.neutre || "alloy";

  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: chosenVoice,
    input: text,
    format: "mp3",
  });

  // retourne un MP3 base64 directement utilisable dans <audio>
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("base64");
}

// ------------------------------------------------------
// ----------------------- HANDLER -----------------------
// ------------------------------------------------------

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Méthode non autorisée" });
    }

    const { id, langue, prenom, theme, sous_theme, intention, detail, voix } = req.body;

    if (!id || !prenom || !theme || !sous_theme || !langue) {
      return res.status(400).json({ error: "Paramètres manquants" });
    }

    // Vérifier bijou
    const { data: rows, error: fetchErr } = await supabase
      .from("bijoux")
      .select("*")
      .eq("id", id)
      .limit(1);

    if (fetchErr || !rows || rows.length === 0) {
      return res.status(404).json({ error: "Bijou introuvable" });
    }

    const bijou = rows[0];

    // --- Génération texte IA ---
    const texte = await generateWhisperIA({
      langue,
      prenom,
      theme,
      sous_theme,
      intention,
      detail,
    });

    // --- Génération audio IA ---
    const audioBase64 = await generateAudioIA(texte, langue, voix);

    // --- Mise à jour bijou ---
    const { error: updateErr } = await supabase
      .from("bijoux")
      .update({
        prenom,
        theme,
        sous_theme,
        intention,
        detail,
        voix,
        langue,
        etat: "configuré",
        date_configure: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateErr) {
      return res.status(500).json({ error: "Erreur mise à jour bijou", details: updateErr });
    }

    // OK
    return res.json({
      ok: true,
      id,
      texte,
      audio_base64: audioBase64,
    });
  } catch (err) {
    console.error("Erreur API /message :", err);
    return res.status(500).json({ error: "Erreur interne", details: err.toString() });
  }
}
