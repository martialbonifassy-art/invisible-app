import { supabase } from "../supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const { id, prenom, intention, detail, voix } = req.body;

  if (!id) {
    res.status(400).json({ error: "ID manquant" });
    return;
  }

  // Vérifier si le bijou existe déjà
  const { data: existing } = await supabase
    .from("bijous")
    .select("id")
    .eq("id", id)
    .single();

  if (existing) {
    // Mise à jour
    const { error } = await supabase
      .from("bijous")
      .update({
        prenom,
        intention,
        detail,
        voix,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      res.status(500).json({ error: "Erreur mise à jour" });
      return;
    }

    res.status(200).json({ ok: true, action: "update" });
    return;
  }

  // Création
  const { error } = await supabase.from("bijous").insert([
    {
      id,
      prenom,
      intention,
      detail,
      voix,
      messages_max: 100,
      messages_restants: 100,
    },
  ]);

  if (error) {
    res.status(500).json({ error: "Erreur insertion" });
    return;
  }

  res.status(200).json({ ok: true, action: "insert" });
}
