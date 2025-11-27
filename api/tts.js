// api/tts.js
// Génère un MP3 à partir d'un texte en utilisant OpenAI TTS (côté serveur)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { text, voice = "coral" } = req.body || {};

    if (!text || !text.trim()) {
      return res
        .status(400)
        .json({ error: "Texte manquant pour la synthèse vocale." });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY non configurée sur le serveur.",
      });
    }

    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts", // tu peux mettre "tts-1" aussi
        input: text,
        voice, // ex : "coral", "nova", "alloy", "fable" etc.
        response_format: "mp3",
      }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error("Erreur TTS OpenAI:", errText);
      return res
        .status(500)
        .json({ error: "Erreur lors de la génération audio." });
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(Buffer.from(audioBuffer));
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ error: "Erreur interne du serveur TTS." });
  }
}
