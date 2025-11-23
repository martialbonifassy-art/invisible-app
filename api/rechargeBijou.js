import { supabase } from "../supabase.js";

export default async function handler(req, res) {
  const id = req.query.id;

  if (!id) {
    res.status(400).json({ error: "ID manquant" });
    return;
  }

  await supabase
    .from("bijous")
    .update({ messages_restants: 100 })
    .eq("id", id);

  res.status(200).json({ ok: true });
}
