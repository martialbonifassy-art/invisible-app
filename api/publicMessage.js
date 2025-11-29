// api/publicMessage.js
//
// Endpoint public : à partir d'un public_id, on retrouve le bijou
// dans Supabase puis on appelle /api/message pour générer le murmure.
// Réponse JSON : { ok, text, audio, lang, id, public_id }

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
    const { public_id, code, c } = req.query || {};
    const publicId = (public_id || code || c || "").trim();

    if (!publicId) {
      return res.status(400).json({ error: "Paramètre public_id manquant." });
    }

    // 1) On retrouve le bijou via son public_id
    const { data: bijou, error } = await supabase
      .from("bijous") // même table que dans message.js
      .select(
        `
        id,
        public_id,
        langue
      `
      )
      .eq("public_id", publicId)
      .maybeSingle();

    if (error) {
      console.error("Erreur Supabase /publicMessage :", error);
      return res
        .status(500)
        .json({ error: "Erreur de connexion à la base de données." });
    }

    if (!bijou) {
      return res
        .status(404)
        .json({ error: "Aucun bijou ne correspond à cette référence publique." });
    }

    const lang = (bijou.langue || "fr").toLowerCase();

    // 2) On appelle /api/message avec l'ID interne du bijou
    const params = new URLSearchParams({
      id: bijou.id,
      lang
    });

    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host || "invisible-app-atelier.vercel.app";
    const baseUrl = `${proto}://${host}`;

    const r = await fetch(`${baseUrl}/api/message?${params.toString()}`);

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error("Erreur HTTP /api/message :", r.status, txt.slice(0, 200));
      return res
        .status(500)
        .json({ error: "Erreur de génération du murmure pour ce bijou." });
    }

    const data = await r.json();

    return res.status(200).json({
      ok: true,
      id: bijou.id,
      public_id: bijou.public_id,
      lang,
      text: data.text || null,
      audio: data.audio || null
    });
  } catch (e) {
    console.error("Erreur interne /api/publicMessage :", e);
    return res
      .status(500)
      .json({ error: "Erreur interne, impossible de joindre la voix du bijou." });
  }
}
