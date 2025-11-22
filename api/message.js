import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const id = req.query.id || "BIJOU";
  const prenom = (req.query.prenom || "").trim();
  const intention = (req.query.intention || "").trim();
  const detail = (req.query.detail || "").trim();
  const voix = (req.query.voix || "neutre").trim();

  let ton = "neutre, doux, réconfortant";
  if (voix === "feminine") {
    ton = "doux, lumineux, légèrement maternel";
  } else if (voix === "masculine") {
    ton = "rassurant, posé, chaleureux";
  }

  const prompt = `
Tu es la voix d'un objet en bois artisanal, équipé d'une puce NFC,
créé par "L’Atelier des Liens Invisibles".
L’objet a pour identifiant : ${id}.

Informations facultatives fournies par la personne qui offre l'objet :
- Prénom de la personne qui reçoit : ${prenom || "(non précisé)"}
- Intention du cadeau : ${intention || "(non précisée)"}
- Détail personnel (lieu, date, livre, film, musique, souvenir) : ${detail || "(non précisé)"}

Consignes :
- Écris UNE SEULE phrase courte, en français.
- Le ton doit être : ${ton}.
- Parle directement à la personne (tu).
- Ne commence pas par "Cher" ou "Chère".
- Ne mentionne pas l’IA, ni la technologie, ni l’atelier.
- Si des informations sont absentes, compose quand même un message doux et présent.
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
