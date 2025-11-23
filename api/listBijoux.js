import { supabase } from "../supabase.js";

export default async function handler(req, res) {
  const { data, error } = await supabase
    .from("bijous")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    res.status(500).json({ error: "Erreur de lecture" });
    return;
  }

  res.status(200).json(data);
}
