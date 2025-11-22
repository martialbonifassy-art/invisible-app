import { supabase } from "../supabase.js";

export default async function handler(req, res) {
  const id = req.query.id;

  if (!id) {
    res.status(400).json({ error: "ID manquant" });
    return;
  }

  const { data, error } = await supabase
    .from("bijous")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    res.status(404).json({ error: "Bijou introuvable" });
    return;
  }

  res.status(200).json(data);
}
