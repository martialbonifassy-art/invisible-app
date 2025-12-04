// /pages/api/message.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ─────────────────────────────
// 1) Config Supabase + OpenAI
// ─────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

type MessageResponse = {
  ok: boolean;
  preview: boolean;
  text?: string;
  audio_url?: string | null;
  remaining?: number | null;
  error?: string;
  error_code?: string;
};

// petit helper pour créer une instance OpenAI seulement si la clé existe
function getOpenAI() {
  if (!OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}

// ─────────────────────────────
// 2) Helper: réponse d’erreur
// ─────────────────────────────

function sendError(
  res: NextApiResponse<MessageResponse>,
  status: number,
  code: string,
  message: string,
  preview: boolean
) {
  console.error("[/api/message] ERROR", status, code, message);
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

  // ─────────────────────────────
  // 0) Vérif config serveur
  // ─────────────────────────────

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return sendError(
      res,
      500,
      "SERVER_CONFIG",
      safeLang === "en"
        ? "Server is not correctly configured (Supabase)."
        : "Le serveur n’est pas correctement configuré (Supabase).",
      isPreview
    );
  }

  const openai = getOpenAI();
  if (!openai) {
    return sendError(
      res,
      500,
      "NO_OPENAI_KEY",
      safeLang === "en"
        ? "OpenAI API key is missing on the server."
        : "La clé OpenAI est absente sur le serveur.",
      isPreview
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (!id) {
    return sendError(
      res,
      400,
      "MISSING_ID",
      safeLang === "en" ? "Missing jewel ID." : "ID de bijou manquant.",
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
      console.error("Supabase fetch error:", fetchError);
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
    // 5) Vérifier le crédit / état (si pas en preview)
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

      // ici on peut commenter ce bloc si tu veux autoriser même sans paid
      if (!bijou.paid) {
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
    // 6) Construire le prompt pour l’IA
    // ─────────────────────────────

    const targetName = prenom || bijou.prenom || "";
    const effectiveTheme = theme || bijou.theme || "";
    const effectiveSousTheme = sous_theme || bijou.sous_theme || "";

    const langueDescription =
      safeLang === "en"
        ? "Write the response in natural, poetic but simple English, spoken in the first person as a whisper addressed directly to the listener."
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
        ? "Length: about 1 spoken minute. No introduction about being an AI."
        : "Longueur : environ 1 minute à l’oral. Ne te présentes pas comme une IA.";

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

    let generatedText = "";

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
      console.error("OpenAI text error:", err);
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
    // 8) Si preview → pas de décrément, pas d’audio
    // ─────────────────────────────

    if (isPreview) {
      return res.status(200).json({
        ok: true,
        preview: true,
        text: generatedText,
        audio_url: null,
        remaining: bijou.messages_restants ?? null,
      });
    }

    // ─────────────────────────────
    // 9) (Optionnel) TTS & stockage audio
    // ─────────────────────────────

    let audioUrl: string | null = null;
    // tu pourras brancher Supabase Storage ici plus tard

    // ─────────────────────────────
    // 10) Décrément des crédits + metadata
    // ─────────────────────────────

    let remaining = bijou.messages_restants;
    if (typeof remaining === "number") {
      remaining = Math.max(0, remaining - 1);
    } else {
      remaining = null;
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
      console.error("Update bijou error:", updateError);
      // On ne bloque pas la réponse pour ça
    }

    return res.status(200).json({
      ok: true,
      preview: false,
      text: generatedText,
      audio_url: audioUrl,
      remaining,
    });
  } catch (err) {
    console.error("Unexpected /api/message error:", err);
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
