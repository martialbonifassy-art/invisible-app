// api/publicMessage.js
//
// Endpoint public appelé par b.html
// Entrée : ?public_id=XXXXXX
// - retrouve le bijou via public_id
// - appelle /api/message?id=... (qui génère le murmure + décrémente messages_restants)
// - relit le bijou pour récupérer le compteur
// - renvoie : { ok, id, public_id, lang, text, audio, messages_restants, messages_max }

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Méthode non autorisée." });
  }

  try {
    const { public_id: publicIdParam } = req.query || {};
    const public_id = (publicIdParam || "").trim();

    if (!public_id) {
      return res
        .status(400)
        .json({ ok: false, error: "Paramètre public_id manquant." });
    }

    // 1) Retrouver le bijou via public_id
    const { data: bijou, error: fetchError } = await supabase
      .from("bijous") // même table que dans api/message.js
      .select("id, public_id, langue")
      .eq("public_id", public_id)
      .maybeSingle();

    if (fetchError) {
      console.error("Erreur Supabase publicMessage (fetch bijou):", fetchError);
      return res.status(500).json({
        ok: false,
        error: "Erreur de lecture des informations du bijou."
      });
    }

    if (!bijou) {
      return res.status(404).json({
        ok: false,
        error: "Aucun bijou trouvé pour ce code public."
      });
    }

    const lang = (bijou.langue || "fr").toLowerCase();

    // 2) Appeler l’endpoint interne /api/message?id=... pour générer texte + audio
    //    /api/message s’occupe déjà de décrémenter messages_restants.
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`;

    const params = new URLSearchParams({
      id: bijou.id,
      lang
    });

    const r = await fetch(`${baseUrl}/api/message?${params.toString()}`);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error("Erreur HTTP /api/message:", r.status, txt);
      return res.status(500).json({
        ok: false,
        error: "Impossible de générer le murmure pour ce bijou."
      });
    }

    const messageData = await r.json();
    const texte =
      messageData.text ||
      (lang === "en"
        ? "I am here, silently, but present for you."
        : "Je suis là, silencieux, mais présent pour toi.");
    const audio = messageData.audio || null;

    // 3) Relire le bijou pour récupérer le compteur après décrément
    const { data: bijouAfter, error: afterError } = await supabase
      .from("bijous")
      .select("messages_restants, messages_max")
      .eq("id", bijou.id)
      .maybeSingle();

    if (afterError) {
      console.error("Erreur Supabase publicMessage (compteur):", afterError);
    }

    const messages_restants =
      typeof bijouAfter?.messages_restants === "number"
        ? bijouAfter.messages_restants
        : null;
    const messages_max =
      typeof bijouAfter?.messages_max === "number"
        ? bijouAfter.messages_max
        : null;

    // 4) Réponse finale
    return res.status(200).json({
      ok: true,
      id: bijou.id,
      public_id: bijou.public_id,
      lang,
      text: texte,
      audio,
      messages_restants,
      messages_max
    });
  } catch (e) {
    console.error("Erreur interne /api/publicMessage:", e);
    return res.status(500).json({
      ok: false,
      error: "Erreur interne pendant la génération du murmure."
    });
  }
}
