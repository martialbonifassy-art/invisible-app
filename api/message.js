import { supabase } from "../../utils/supabaseClient";

// --- Fonction interne : génération du murmure via IA (OpenAI ou autre) ---
async function generateWhisperIA({ langue, prenom, theme, sous_theme, intention, detail }) {
  // MESSAGE de construction du prompt
  const prompt =
    langue === "en"
      ? `
You are an AI that writes intimate, poetic whispers linked to wooden objects.
Write 1 short message (3–5 lines), gentle, warm, emotional.

Recipient: ${prenom}
Main theme: ${theme}
Sub-theme: ${sous_theme}
User intention: ${intention || "None"}
Detail to integrate: ${detail || "None"}

Style rules:
• poetic but never cliché
• emotional but not needy
• warm, subtle, sensory
• for theme "Sensualité complice": sensual, elegant, suggestive, *never vulgar*
• no emojis
`
      : `
Tu es une IA qui écrit des murmures intimes, poétiques, liés à un bijou en bois.
Rédige 1 message court (3–5 lignes), doux, subtil et émotionnel.

Destinataire : ${prenom}
Thème principal : ${theme}
Sous-thème : ${sous_theme}
Intention : ${intention || "Aucune"}
Détail à intégrer : ${detail || "Aucun"}

Règles de style :
• poétique mais jamais cliché
• émotionnel mais pas plaintif
• chaleureux, sensoriel, intime
• pour "Sensualité complice" : sensuel, élégant, suggestif, *jamais vulgaire*
• pas d’emojis
`;

  // --------------- IA ACTIVE ? ---------------
  // ❗ Remplace ici par ton modèle réel (OpenAI, Groq, DeepSeek…)
  // ❗ Pour le moment FAKE = IA OFF
  const IA_ACTIVE = false;

  if (!IA_ACTIVE) {
    return langue === "en"
      ? `A soft and intimate whisper for ${prenom}, inspired by the theme of ${theme}. (Demo mode)`
      : `Un murmure doux et intime pour ${prenom}, inspiré du thème ${theme}. (Mode démo)`;
  }

  // --- Exemple futur quand IA réelle activée ---
  /*
  const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0].message.content.trim();
  */
}

// --- Fonction interne : générer audio du murmure ---
async function generateAudioIA(text, langue, voix) {
  // IA TTS désactivée → RETURN NULL
  const TTS_ACTIVE = false;

  if (!TTS_ACTIVE) return null;

  /*
  const voiceResponse = await openai.audio.create({
    model: "something",
    voice: voix,
    text,
    format: "mp3",
  });

  return voiceResponse.base64_mp3;
  */
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

    // Vérifier que le bijou existe bien
    const { data: rows, error: fetchErr } = await supabase
      .from("bijoux")
      .select("*")
      .eq("id", id)
      .limit(1);

    if (fetchErr || !rows || rows.length === 0) {
      return res.status(404).json({ error: "Bijou introuvable" });
    }

    const bijou = rows[0];

    // --- Générer le texte IA ---
    const texte = await generateWhisperIA({
      langue,
      prenom,
      theme,
      sous_theme,
      intention,
      detail,
    });

    // --- Générer l'audio ---
    const audio = await generateAudioIA(texte, langue, voix);

    // Mettre à jour le bijou (configuration complète)
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

    // Réponse API
    return res.json({
      ok: true,
      id,
      texte,
      audio,
    });
  } catch (err) {
    console.error("Erreur API /message :", err);
    return res.status(500).json({ error: "Erreur interne", details: err.toString() });
  }
}
