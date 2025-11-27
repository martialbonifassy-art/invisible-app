// api/saveBijou.js
//
// Enregistre ou met à jour un bijou dans la table "bijoux"
// en tenant compte de la nouvelle structure (langue, etat, theme, sous_theme…).

import { createClient } from "@supabase/supabase-js";

// ⚠️ Tu peux soit mettre ces valeurs en dur comme ici,
// soit les déplacer dans des variables d'environnement Vercel.
const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const {
      id,
      prenom,
      intention,
      detail,
      voix,
      theme,
      sous_theme,
      langue
    } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: "ID du bijou manquant." });
    }

    const now = new Date().toISOString();
    const langueFinale = langue || "fr";

    // Vérifier si le bijou existe déjà
    const { data: existing, error: checkError } = await supabase
      .from("bijoux")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 = aucune ligne, ce n'est pas vraiment une erreur bloquante
      console.error("Erreur vérification bijou:", checkError);
      return res
        .status(500)
        .json({ error: "Erreur lors de la vérification du bijou." });
    }

    if (!existing) {
      // ─────────────────────────────────────────
      // INSERT : nouveau bijou
      // ─────────────────────────────────────────
      const { error: insertError } = await supabase.from("bijoux").insert({
        id,
        prenom: prenom || null,
        intention: intention || null,
        detail: detail || null,
        voix: voix || "neutre",
        theme: theme || null,
        sous_theme: sous_theme || null,
        langue: langueFinale,
        etat: "configure",
        messages_max: 100,
        messages_restants: 100,
        date_creation: now,
        date_configure: now
        // public_id, client_email, origin, paid, locked
        // peuvent être remplis plus tard si besoin
      });

      if (insertError) {
        console.error("Erreur insert bijou:", insertError);
        return res
          .status(500)
          .json({ error: "Impossible d’enregistrer le bijou (création)." });
      }
    } else {
      // ─────────────────────────────────────────
      // UPDATE : bijou existant
      // ─────────────────────────────────────────
      const { error: updateError } = await supabase
        .from("bijoux")
        .update({
          prenom: prenom || null,
          intention: intention || null,
          detail: detail || null,
          voix: voix || "neutre",
          theme: theme || null,
          sous_theme: sous_theme || null,
          langue: langueFinale,
          etat: "configure",
          date_configure: now
          // on NE touche PAS aux messages_restants / messages_max ici,
          // pour ne pas les réinitialiser à chaque modification.
        })
        .eq("id", id);

      if (updateError) {
        console.error("Erreur update bijou:", updateError);
        return res
          .status(500)
          .json({ error: "Impossible d’enregistrer le bijou (mise à jour)." });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Erreur saveBijou:", e);
    return res.status(500).json({ error: "Erreur interne du serveur." });
  }
}
