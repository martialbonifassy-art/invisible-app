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

  // 1️⃣ Charger le bijou dans Supabase
  const { data: bijou, error } = await supabase
    .from("bijous")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !bijou) {
    res.status(404).json({ error: "Bijou inconnu" });
    return;
  }

  let {
    prenom,
    intention,
    detail,
    voix,
    messages_restants,
    messages_max,
  } = bijou;

  // 2️⃣ Si le bijou n’a plus de messages → message spécial
  if (messages_restants <= 0) {
    res.status(200).json({
      text:
        "Ce bijou a offert tous ses murmures. Une recharge est disponible auprès de l’Atelier des Liens Invisibles.",
      messages_restants: 0,
      messages_max,
      depleted: true,
    });
    return;
  }

  // 3️⃣ Mettre à jour le compteur dans Supabase (décrémentation)
  await supabase
    .from("bijous")
    .update({
      messages_restants: messages_restants - 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // 4️⃣ Définir le ton en fonction de la voix
  let ton =
    voix === "feminine"
      ? "doux, lumineux, maternel"
      : voix === "masculine"
      ? "rassurant, posé, chaleureux"
      : "neutre, délicat, intime";

  // 5️⃣ Préparer le prompt IA
  const prompt = `
Tu es la voix d’un bijou artisanal en bois.
Crée une phrase courte, poétique et intime.

Informations :
Prénom : ${prenom}
Intention : ${intention}
Détail : ${detail}
Ton : ${ton}

La phrase doit être :
- personnelle
- émotionnelle
- en “tu”
- jamais technologique
- jamais bruyante
  `.trim();

  // 6️⃣ Appeler OpenAI
  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const text =
      response.output?.[0]?.content?.[0]?.text?.trim() ||
      "Je suis là, dans le silence, pour t’accompagner.";

    res.status(200).json({
      text,
      messages_restants: messages_restants - 1,
      messages_max,
    });
  } catch (e) {
    console.error("Erreur IA:", e);
    res.status(500).json({
      error: "Erreur IA",
    });
  }
}
