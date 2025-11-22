import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const id = req.query.id || "TEST";

  const prompt = `
Tu es un petit bijou ou objet en bois de "L’Atelier des Liens Invisibles".
L'objet a pour identifiant : ${id}.
Écris UNE SEULE phrase courte, en français, douce et réconfortante,
pour la personne qui le tient. Ne parle pas de technologie, ni d'IA.
`;

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const text =
      response.output?.[0]?.content?.[0]?.text?.trim() ||
      "Je suis là, silencieux, mais présent pour toi.";

    res.status(200).json({ text });
  } catch (e) {
    console.error("Erreur IA:", e);
    res.status(500).json({ error: "Erreur IA" });
  }
}
