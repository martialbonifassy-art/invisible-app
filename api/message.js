// pages/api/message.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ─────────────────────────────
// 1) Config Supabase + OpenAI
// ─────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
const SUPABASE_SERVICE_KEY = process.env
  .SUPABASE_SERVICE_KEY as string | undefined;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn("[/api/message] SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant(e)s");
}
if (!OPENAI_API_KEY) {
  console.warn("[/api/message] OPENAI_API_KEY manquante");
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// ─────────────────────────────
// 2) Type de réponse JSON
// ─────────────────────────────

type MessageResponse = {
  ok: boolean;
  preview: boolean;
  text?: string;
  audio_url?: string | null;
  remaining?: number;
  error?: string;
  error_code?: string;
};

// Helper erreur
function sendError(
  res: NextApiResponse<MessageResponse>,
  status: number,
  code: string,
  message: string,
  preview: boolean
) {
  console.error("[/api/message] error:", status, code, message);
  res.status(status).json({
    ok: false,
    preview,
    error_code: code,
    error: message,
  });
}

// ─────────────────────────────
// 3) Handler principal
// ─────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MessageResponse>
) {
  if (req.method !== "GET") {
    return sendError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Only GET is allowed.",
      true
    );
  }

  const {
    id,
    prenom = "",
    intention = "",
    detail = "",
    voix = "neutre",
    lang = "fr",
    preview: previewParam,
    theme,
    sous_theme,
  } = req.query as {
    id?: string;
    prenom?: string;
    intention?: string;
    detail?: string;
    voix?: string;
    lang?: string;
    preview?: string;
    theme?: string;
    sous_theme?: string;
  };

  const isPreview = previewParam === "1" || previewParam === "true";
  const safeLang = lang === "en" ? "en" : "fr";

  if (!id) {
    return sendError(
      res,
      400,
      "MISSING_ID",
      safeLang === "en" ? "Missing jewel ID." : "ID de bijou manquant.",
      isPreview
    );
  }

  if (!supabase || !openai) {
    return sendError(
      res,
      500,
      "MISSING_CONFIG",
      safeLang === "en"
        ? "Server configuration error."
        : "Erreur de configuration du serveur.",
      isPreview
    );
  }

  try {
    // ─────────────────────────────
    // 4) Récupérer le bijou
    // ─────────────────────────────
    const { data: bijou, error: fetchError } = await supabase
      .from("bijous")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("[/api/message] Supabase fetch error:", fetchError);
      return sendError(
        res,
        500,
        "DB_ERROR",
        safeLang === "en"
          ? "Error while fetching the jewel."
          : "Erreur lors de la récupération du bijou.",
        isPreview
      );
    }

    if (!bijou) {
      return sendError(
        res,
        404,
        "NOT_FOUND",
        safeLang === "en"
          ? "No jewel found with this ID."
          : "Aucun bijou trouvé avec cet ID.",
        isPreview
      );
    }

    // ─────────────────────────────
    // 5) Vérifier crédits / état (si pas preview)
    // ─────────────────────────────
    if (!isPreview) {
      if (bijou.locked) {
        return sendError(
          res,
          403,
          "LOCKED",
          safeLang === "en"
            ? "This jewel is locked. Please contact the Atelier."
            : "Ce bijou est verrouillé. Merci de contacter l’Atelier.",
          false
        );
      }

      // Si tu veux laisser parler les bijoux non payés, commente ce bloc
      if (bijou.paid === false) {
        return sendError(
          res,
          402,
          "UNPAID",
          safeLang === "en"
            ? "This jewel has not been activated yet."
            : "Ce bijou n’a pas encore été activé.",
          false
        );
      }

      if (
        typeof bijou.messages_restants === "number" &&
        bijou.messages_restants <= 0
      ) {
        return sendError(
          res,
          403,
          "NO_CREDIT",
          safeLang === "en"
            ? "No whispers left on this jewel."
            : "Il ne reste plus de murmures sur ce bijou.",
          false
        );
      }
    }

    // ─────────────────────────────
    // 6) Construire le prompt
    // ─────────────────────────────

    const targetName = prenom || bijou.prenom || "";
    const effectiveTheme = theme || bijou.theme || "";
    const effectiveSousTheme = sous_theme || bijou.sous_theme || "";

    const langueDescription =
      safeLang === "en"
        ? "Write the response in natural, simple, intimate English, in the first person, as a whisper addressed directly to the listener."
        : "Écris la réponse en français, dans un ton simple, poétique et intime, à la première personne, comme un murmure adressé directement à la personne qui écoute.";

    const baseContext =
      safeLang === "en"
        ? "You are the invisible whisper linked to a wooden jewel, created by a human artisan."
        : "Tu es le murmure invisible lié à un bijou en bois, créé par un artisan humain.";

    const themeLine =
      effectiveTheme || effectiveSousTheme
        ? safeLang === "en"
          ? `Main theme: ${effectiveTheme || "-"}, sub-theme: ${effectiveSousTheme || "-"}.`
          : `Thème principal : ${effectiveTheme || "-"}, sous-thème : ${effectiveSousTheme || "-"}.`
        : "";

    const intentionLine =
      intention || bijou.intention
        ? safeLang === "en"
          ? `Extra instructions from the giver: ${intention || bijou.intention}.`
          : `Instructions supplémentaires de la personne qui offre : ${intention || bijou.intention}.`
        : "";

    const detailLine =
      detail || bijou.detail
        ? safeLang === "en"
          ? `A memory or detail to weave in: ${detail || bijou.detail}.`
          : `Un souvenir ou détail à intégrer : ${detail || bijou.detail}.`
        : "";

    const nameLine = targetName
      ? safeLang === "en"
        ? `The whisper is addressed to: ${targetName}.`
        : `Le murmure s’adresse à : ${targetName}.`
      : "";

    const lengthInstruction =
      safeLang === "en"
        ? "Length: about 1 to 2 spoken minutes. Do not say that you are an AI."
        : "Longueur : environ 1 à 2 minutes à l’oral. Ne te présentes pas comme une IA.";

    const fullPrompt = [
      baseContext,
      langueDescription,
      lengthInstruction,
      themeLine,
      nameLine,
      intentionLine,
      detailLine,
    ]
      .filter(Boolean)
      .join("\n");

    // ─────────────────────────────
    // 7) Appel OpenAI (texte)
    // ─────────────────────────────

    let generatedText: string;

    try {
      const chat = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: fullPrompt },
          {
            role: "user",
            content:
              safeLang === "en"
                ? "Compose the whisper now."
                : "Compose maintenant le murmure.",
          },
        ],
        temperature: 0.9,
        max_tokens: 600,
      });

      generatedText =
        chat.choices?.[0]?.message?.content?.trim() ||
        (safeLang === "en"
          ? "I am here, silent, but present for you."
          : "Je suis là, silencieux, mais présent pour toi.");
    } catch (err) {
      console.error("[/api/message] OpenAI text error:", err);
      return sendError(
        res,
        500,
        "GENERATION_ERROR",
        safeLang === "en"
          ? "Error while generating the whisper."
          : "Erreur lors de la génération du murmure.",
        isPreview
      );
    }

    // ─────────────────────────────
    // 8) Preview → pas de décrément
    // ─────────────────────────────

    if (isPreview) {
      return res.status(200).json({
        ok: true,
        preview: true,
        text: generatedText,
        audio_url: null,
      });
    }

    // ─────────────────────────────
    // 9) Décrément des crédits
    // ─────────────────────────────

    let remaining = bijou.messages_restants as number | null;

    if (typeof remaining === "number") {
      remaining = Math.max(0, remaining - 1);
    }

    const { error: updateError } = await supabase
      .from("bijous")
      .update({
        messages_restants: remaining,
        last_used_at: new Date().toISOString(),
        last_prenom: targetName || null,
        last_lang: safeLang,
        last_theme: effectiveTheme || null,
        last_sous_theme: effectiveSousTheme || null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("[/api/message] Update bijou error:", updateError);
      // On n’empêche pas la réponse au client pour autant
    }

    // ─────────────────────────────
    // 10) Réponse finale OK
    // ─────────────────────────────

    return res.status(200).json({
      ok: true,
      preview: false,
      text: generatedText,
      audio_url: null, // pas d’audio pour l’instant
      remaining: typeof remaining === "number" ? remaining : undefined,
    });
  } catch (err) {
    console.error("[/api/message] Unexpected error:", err);
    return sendError(
      res,
      500,
      "UNEXPECTED_ERROR",
      safeLang === "en"
        ? "Unexpected error while generating the whisper."
        : "Erreur inattendue lors de la génération du murmure.",
      isPreview
    );
  }
}
