// api/publicMessage.js
//
// Point d’entrée PUBLIC par `public_id`.
// - Résout public_id -> id interne dans la table "bijous"
// - Réutilise tout le handler de /api/message (génération texte + audio, quotas, locked, etc.)

import { createClient } from "@supabase/supabase-js";
import messageHandler from "./message";

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
    // Compatibilité : ?public_id=XXX (nouveau), ou ?code= / ?c= (ancien)
    const { public_id, code, c } = req.query || {};
    const effectivePublicId = public_id || code || c;

    if (!effectivePublicId) {
      return res.status(400).json({ error: "Paramètre public_id manquant." });
    }

    // 1) retrouver le bijou via son public_id
    const { data: bijou, error } = await supabase
      .from("bijous")
      .select("id")
      .eq("public_id", effectivePublicId)
      .maybeSingle();

    if (error) {
      console.error("[publicMessage] Erreur Supabase:", error);
      return res
        .status(500)
        .json({ error: "Erreur lors de la lecture du bijou." });
    }

    if (!bijou) {
      return res.status(404).json({ error: "Bijou inconnu pour ce public_id." });
    }

    // 2) Injecter l'id interne dans la query et déléguer à /api/message
    req.query = {
      ...req.query,
      id: bijou.id
    };

    // On laisse message.js gérer toute la logique (quotas, locked, TTS, etc.)
    return messageHandler(req, res);
  } catch (e) {
    console.error("[publicMessage] Erreur interne:", e);
    return res.status(500).json({ error: "Erreur interne serveur." });
  }
}
