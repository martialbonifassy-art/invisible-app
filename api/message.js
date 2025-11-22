import OpenAI from "openai";
import { BIJOUS } from "../bijous.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const id = (req.query.id || "BIJOU").trim();

  // Valeurs éventuelles envoyées par la page de personnalisation (prévisualisation)
  let prenom = (req.query.prenom || "").trim();
  let intention = (req.query.intention || "").trim();
  let detail = (req.query.detail || "").trim();
  let voix = (req.query.voix || "neutre").trim();

  // On essaie d'abord de trouver le bijou dans la "base" bijous.js
  const bijou = BIJOUS.find((b) => b.id === id);

  if (bijou) {
    // Si on a une fiche enregistrée, on l'utilise en priorité
    prenom = bijou.prenom || prenom;
    intention = bijou.intention || intention;
    detail = bijou.detail || detail;
    voix = bijou.voix || voix;
  }

  let ton = "neutre, doux, réconfortant";
  if (voix === "feminine") {
    ton = "doux, lumineux, légèrement maternel";
  } else if (voix === "masculine") {
    ton = "rassurant, posé, chaleureux";
  }

  const prompt = `
Tu es la voix d'un objet en bois artisanal de "L’Atelier des Liens Invisibles".
L'objet a pour identifiant : ${id}.

Prénom de la personne : ${prenom || "(non précisé)"}
Intention du cadeau : ${intention || "(non précisée)"}
Détail personnel (lieu, date, livre, film, musique, souvenir) : ${detail || "(non précisé)"}

Consignes :
- Écris UNE SEULE phrase, courte, en français.
- Le ton doit être : ${ton}.
- Tu t'adresses directement à la personne ("tu").
- Ne commence pas par "Cher" ou "Chère".
- Ne mentionne pas l’IA, la technologie, ni l’atelier.
- Si des infos manquent, compose quand même un message doux et présent.
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
