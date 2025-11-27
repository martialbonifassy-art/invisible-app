// api/tts.js
// Génère un MP3 à partir d'un texte en utilisant OpenAI TTS

export const config = {
  runtime: "edge", // plus simple pour parser le body + utiliser fetch
};

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { text, voice = "coral" } = await req.json();

    if (!text || !text.trim()) {
      return new Response(
        JSON.stringify({ error: "Texte manquant pour la synthèse vocale." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "OPENAI_API_KEY non configurée sur le serveur.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts", // ou "tts-1" si tu préfères
        input: text,
        voice, // ex : "coral", "alloy", "nova", "onyx"...
        response_format: "mp3",
      }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error("Erreur TTS OpenAI:", errText);
      return new Response(
        JSON.stringify({ error: "Erreur lors de la génération audio." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur TTS." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
