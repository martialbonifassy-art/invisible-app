// /api/getBijou.js

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn(
    "[/api/getBijou] SUPABASE_URL ou SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY manquant(e)s"
  );
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

function sendError(res, status, code, message) {
  console.error("[/api/getBijou] error:", status, code, message);
  res.status(status).json({
    ok: false,
    error_code: code,
    error: message,
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only GET is allowed.");
  }

  if (!supabase) {
    return sendError(
      res,
      500,
      "MISSING_CONFIG",
      "Erreur de configuration du serveur."
    );
  }

  const { code } = req.query;
  const raw = (code || "").trim();

  if (!raw) {
    return sendError(res, 400, "MISSING_CODE", "Code bijou manquant.");
  }

  // On normalise en majuscules (tes codes sont de ce type)
  const normalized = raw.toUpperCase();

  try {
    // On accepte :
    //  - id = "BIJOU398709"
    //  - public_id = "100BM100"
    const { data, error } = await supabase
      .from("bijous")
      .select("*")
      .or(
        `id.eq.${normalized},public_id.eq.${normalized}`
      )
      .maybeSingle();

    if (error) {
      console.error("[/api/getBijou] Supabase error:", error);
      return sendError(
        res,
        500,
        "DB_ERROR",
        "Erreur lors de la recherche du bijou."
      );
    }

    if (!data) {
      return res.status(200).json({
        ok: false,
        error_code: "NOT_FOUND",
        error: "Aucun bijou ne correspond à ce code.",
      });
    }

    // Succès : on renvoie le bijou
    return res.status(200).json({
      ok: true,
      bijou: data,
    });
  } catch (err) {
    console.error("[/api/getBijou] Unexpected error:", err);
    return sendError(
      res,
      500,
      "UNEXPECTED_ERROR",
      "Erreur inattendue lors de la recherche du bijou."
    );
  }
}
