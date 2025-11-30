// api/publicMessage.js
//
// Endpoint "public" appelé par b.html avec un code de bijou (public_id).
// - Ne dévoile jamais l'ID interne dans l'URL.
// - Cherche le bijou par public_id dans Supabase.
// - Applique une petite protection de fréquence (anti spam).
// - Délègue la génération du murmure à /api/message (IA ou fallback).
//
// Réponse JSON typique :
// {
//   ok: true,
//   id: "BIJOU0002",         // ID interne (utile côté front, mais jamais dans l'URL publique)
//   public_id: "95QN27",     // code public utilisé sur la carte / NFC
//   lang: "fr",
//   text: "...",
//   audio: "data:audio/mp3;base64,..."
// }

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// délai minimum entre deux murmures pour un même bijou (en ms)
const MIN_DELAY_MS = 15_000;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res
      .status(405)
      .json({ ok: false, error: "Méthode non autorisée / Method not allowed." });
  }

  try {
    const { public_id: publicIdParam, c, lang: langParam } = req.query || {};
    const publicId = (publicIdParam || c || "").trim();

    if (!publicId) {
      return res.status(400).json({
        ok: false,
        error: "Paramètre public_id manquant.",
        text:
          "Ce lien ne contient pas de code de bijou valide. Vérifiez le QR code ou la puce NFC, ou contactez l’atelier.",
        audio: null,
      });
    }

    // ─────────────────────────────────────
    // 1) Récupération du bijou par public_id
    // ─────────────────────────────────────
    const { data: bijou, error } = await supabase
      .from("bijous")
      .select(
        `
        id,
        public_id,
        langue,
        etat,
        locked,
        messages_restants,
        messages_max,
        date_dernier_murmure,
        prenom,
        theme,
        sous_theme
      `
      )
      .eq("public_id", publicId)
      .maybeSingle();

    if (error) {
      console.error("Erreur Supabase /publicMessage:", error);
      return res.status(200).json({
        ok: false,
        error: "DB_ERROR",
        text:
          "Je suis là, silencieux, mais présent pour toi. (Erreur de connexion à l’atelier.)",
        audio: null,
      });
    }

    if (!bijou) {
      return res.status(200).json({
        ok: false,
        error: "NOT_FOUND",
        text:
          "Ce bijou n’est pas reconnu dans l’atelier. Vérifiez le code ou contactez l’Atelier des Liens Invisibles.",
        audio: null,
      });
    }

    // ─────────────────────────────────────
    // 2) Langue effective (FR / EN)
    // ─────────────────────────────────────
    const langueFromDb = (bijou.langue || "").toLowerCase();
    const langFromReq = (langParam || "").toLowerCase();
    const langue = langFromReq || langueFromDb || "fr";
    const isEn = langue === "en";

    // ─────────────────────────────────────
    // 3) Petite protection de fréquence
    //    (évite qu’un script appelle le bijou 20 fois / seconde)
    // ─────────────────────────────────────
    if (bijou.date_dernier_murmure) {
      const last = new Date(bijou.date_dernier_murmure).getTime();
      const now = Date.now();
      if (Number.isFinite(last) && now - last < MIN_DELAY_MS) {
        const remaining = Math.ceil(
          (MIN_DELAY_MS - (now - last)) / 1000
        );

        const text = isEn
          ? `The jewel needs a short pause before whispering again. Try again in a few seconds (${remaining}s).`
          : `Le bijou a besoin d’une petite pause avant de murmurer à nouveau. Réessaie dans quelques secondes (${remaining}s).`;

        return res.status(200).json({
          ok: false,
          error: "RATE_LIMIT",
          text,
          audio: null,
        });
      }
    }

    // ─────────────────────────────────────
    // 4) Déléguer la génération à /api/message
    //    (c’est là que se trouvent toute la logique IA + TTS)
    // ─────────────────────────────────────
    const protocol =
      req.headers["x-forwarded-proto"] ||
      (req.headers.host && req.headers.host.startsWith("localhost")
        ? "http"
        : "https");
    const baseUrl = `${protocol}://${req.headers.host}`;

    const searchParams = new URLSearchParams({
      id: String(bijou.id),
      lang: langue,
    });

    const resp = await fetch(`${baseUrl}/api/message?${searchParams.toString()}`);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(
        "Erreur appel interne /api/message:",
        resp.status,
        errText.slice(0, 200)
      );
      const fallbackText = isEn
        ? "I am here, silently, but present for you. (Internal error.)"
        : "Je suis là, silencieux, mais présent pour toi. (Erreur interne.)";

      return res.status(200).json({
        ok: false,
        error: "INTERNAL_MESSAGE_ERROR",
        text: fallbackText,
        audio: null,
      });
    }

    const msgData = await resp.json().catch(() => null);

    const text =
      msgData && typeof msgData.text === "string"
        ? msgData.text
        : isEn
        ? "I am here, silently, but present for you."
        : "Je suis là, silencieux, mais présent pour toi.";
    const audio =
      msgData && typeof msgData.audio === "string" ? msgData.audio : null;

    // ─────────────────────────────────────
    // 5) Réponse finale "propre"
    // ─────────────────────────────────────
    return res.status(200).json({
      ok: true,
      id: bijou.id,
      public_id: bijou.public_id,
      lang: langue,
      text,
      audio,
    });
  } catch (e) {
    console.error("Erreur inattendue /publicMessage:", e);
    return res.status(200).json({
      ok: false,
      error: "UNCAUGHT_ERROR",
      text: "Je suis là, silencieux, mais présent pour toi. (Erreur interne.)",
      audio: null,
    });
  }
}
