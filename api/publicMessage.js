// api/publicMessage.js
//
// Endpoint public appelé par b.html
// Entrée : ?public_id=XXXXXX
// - retrouve le bijou via public_id
// - appelle /api/message?id=... (qui génère le murmure + décrémente)
// - relit le bijou pour récupérer le compteur
// - renvoie toujours 200 avec :
//   { ok, id, public_id, lang, text, audio, messages_restants, messages_max, error? }

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    // on renvoie quand même 200 pour que le front ne tombe pas dans le catch
    return res.status(200).json({
      ok: false,
      error: "Méthode non autorisée."
    });
  }

  try {
    const { public_id: publicIdParam, lang: langParam } = req.query || {};
    const public_id = (publicIdParam || "").trim();

    if (!public_id) {
      return res.status(200).json({
        ok: false,
        error: "Paramètre public_id manquant.",
        text: "Ce bijou n’a pas pu être identifié. Le code public est manquant.",
        audio: null
      });
    }

    // 1) Retrouver le bijou via public_id
    const { data: bijou, error: fetchError } = await supabase
      .from("bijous") // même table que dans api/message.js
      .select("id, public_id, langue")
      .eq("public_id", public_id)
      .maybeSingle();

    if (fetchError) {
      console.error("Erreur Supabase publicMessage (fetch bijou):", fetchError);
      return res.status(200).json({
        ok: false,
        error: "Erreur de lecture des informations du bijou.",
        text:
          "Ce bijou semble silencieux pour le moment. Une erreur s’est produite en le rejoignant.",
        audio: null
      });
    }

    if (!bijou) {
      return res.status(200).json({
        ok: false,
        error: "Aucun bijou trouvé pour ce code public.",
        text:
          "Ce code ne correspond à aucun bijou enregistré dans l’atelier. Vérifiez le lien ou contactez l’atelier.",
        audio: null
      });
    }

    const langDb = (bijou.langue || "fr").toLowerCase();
    const lang = (langParam || langDb || "fr").toLowerCase();

    // 2) Appeler l’endpoint interne /api/message?id=... pour générer texte + audio
    //    /api/message s’occupe déjà de décrémenter messages_restants.
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    let texte = lang === "en"
      ? "I am here, silently, but present for you."
      : "Je suis là, silencieux, mais présent pour toi.";
    let audio = null;

    try {
      const params = new URLSearchParams({
        id: bijou.id,
        lang
      });

      const r = await fetch(`${baseUrl}/api/message?${params.toString()}`);
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        console.error("Erreur HTTP /api/message:", r.status, txt);
      } else {
        const messageData = await r.json();
        texte =
          messageData.text ||
          texte;
        audio = messageData.audio || null;
      }
    } catch (err) {
      console.error("Erreur d’appel à /api/message depuis publicMessage:", err);
      // on garde le texte par défaut + audio null
    }

    // 3) Relire le bijou pour récupérer le compteur après décrément
    let messages_restants = null;
    let messages_max = null;

    try {
      const { data: bijouAfter, error: afterError } = await supabase
        .from("bijous")
        .select("messages_restants, messages_max")
        .eq("id", bijou.id)
        .maybeSingle();

      if (afterError) {
        console.error("Erreur Supabase publicMessage (compteur):", afterError);
      } else if (bijouAfter) {
        if (typeof bijouAfter.messages_restants === "number") {
          messages_restants = bijouAfter.messages_restants;
        }
        if (typeof bijouAfter.messages_max === "number") {
          messages_max = bijouAfter.messages_max;
        }
      }
    } catch (err) {
      console.error("Erreur inattendue récupération compteur:", err);
    }

    // 4) Réponse finale (toujours 200 pour que le front ne tombe pas dans le catch)
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
    return res.status(200).json({
      ok: false,
      error: "Erreur interne pendant la génération du murmure.",
      text:
        "Je suis là, silencieux, mais présent pour toi. (Une erreur interne s’est produite.)",
      audio: null
    });
  }
}
