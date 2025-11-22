import OpenAI from "openai";
import { supabase } from "../supabase.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const id = req.query.id;

  if (!id) {
    res.status(400).json({ error: "ID manquant" });
    return;
  }

  // 1️⃣ Récupérer le bijou dans Supabase
  const { data: bijou, error } = await supabase
    .from("bijous")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !bijou) {
    res.status(404).json({ error: "Bijou inconnu" });
    return;
  }

  let { prenom, intention, detail, voix, messages_restants } = bijou;

  // 2️⃣ Si plus de messages → message spécial
  if (messages_restants <= 0) {
    res.status(200).json({
      text:
        "Ce bijou a offert tous ses murmures. Vous pouvez demander une recharge auprès de l’Atelier des Liens Invisibles.",
    });
    return;
  }

  // 3️⃣ Décrémenter le compteur dans Supabase
  await supabase
    .from("bijous")
    .update({
      messages_restants: messages_restants - 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // 4️⃣ Déterminer le ton de la voix
  let ton = "neutre, doux, réconfortant";
  if (voix === "feminine") ton = "doux, lumineux, légèrement maternel";
  if (voix === "masculine") ton = "rassurant, posé, chaleureux";

  // 5️⃣ Construire le prompt IA
  const prompt = `
Tu es la voix d'un bijou artisanal en bois équipé d'une puce NFC.
ID du bijou : ${id}.
Prénom : ${prenom || "(non précisé)"}.
Intention : ${intention || "(non précisée)"}.
Détail personnel : ${detail || "(non précisé)"}.
Ton : ${ton}.

Écris UNE seule phrase, courte, poétique et intime.
Ne mentionne jamais l'IA, la technologie ou l'atelier.
S'adresse à la personne en utilisant "tu".
  `;

  // 6️⃣ Appel IA OpenAI
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
