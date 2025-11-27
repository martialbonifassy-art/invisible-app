// api/listBijoux.js
//
// Renvoie la liste des bijoux pour le Dashboard artisan,
// avec les nouveaux champs (etat, langue, paid, etc.).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const { data, error } = await supabase
      .from("bijoux")
      .select(
        `
        id,
        public_id,
        etat,
        langue,
        prenom,
        theme,
        sous_theme,
        intention,
        detail,
        voix,
        messages_restants,
        messages_max,
        paid,
        date_creation,
        date_configure,
        date_dernier_murmure
      `
      )
      .order("date_creation", { ascending: false });

    if (error) {
      console.error("Erreur listBijoux:", error);
      return res
        .status(500)
        .json({ error: "Impossible de charger la liste des bijoux." });
    }

    // Le Dashboard actuel n'utilise que id, prenom, messages_restants, messages_max, voix,
    // mais renvoyer plus d'infos ne casse rien : le front ignore ce qu'il ne lit pas.
    return res.status(200).json(data || []);
  } catch (e) {
    console.error("Erreur interne listBijoux:", e);
    return res.status(500).json({ error: "Erreur interne du serveur." });
  }
}
