// api/saveBijou.js
//
// Enregistre ou met à jour un bijou dans la table "bijoux"
// avec génération automatique d'un public_id unique pour chaque bijou.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────
// Génération d'un code public court (6 caractères)
// ─────────────────────────────────────────
function generateRandomPublicId(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0, 1, I, O pour éviter les confusions
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// Vérifie que le code généré n'existe pas déjà dans la table "bijoux"
async function generateUniquePublicId() {
  const maxTries = 8;
  for (let i = 0; i < maxTries; i++) {
    const candidate = generateRandomPublicId();
    const { data, error } = await supabase
      .from("bijoux")
      .select("id")
      .eq("public_id", candidate)
      .maybeSingle();

    // Si aucune ligne trouvée et pas d'erreur, on peut utiliser ce code
    if (!error && !data) {
      return candidate;
    }
  }
  // Si jamais on ne trouve pas, on renvoie quand même un code,
  // mais le risque de collision est extrêmement faible.
  return generateRandomPublicId();
}

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
      .select("id, public_id")
      .eq("id", id)
      .maybeSingle();

    if (checkError) {
      console.error("Erreur vérification bijou:", checkError);
      return res
        .status(500)
        .json({ error: "Erreur lors de la vérification du bijou." });
    }

    if (!existing) {
      // ─────────────────────────────────────────
      // INSERT : nouveau bijou
      // ─────────────────────────────────────────
      const publicId = await generateUniquePublicId();

      const { error: insertError } = await supabase.from("bijoux").insert({
        id,
        public_id: publicId,
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
        // client_email, origin, paid, locked...
        // pourront être remplis plus tard
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

      let publicIdToUse = existing.public_id;

      // Si le bijou existant n'a PAS encore de public_id, on en génère un
      if (!publicIdToUse) {
        publicIdToUse = await generateUniquePublicId();
      }

      const { error: updateError } = await supabase
        .from("bijoux")
        .update({
          public_id: publicIdToUse,
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
