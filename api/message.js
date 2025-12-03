// /pages/api/message.ts (Next.js) ou /api/message.js (Vercel)

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ─────────────────────────────
// 1) Config Supabase + OpenAI
// ─────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY as string;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─────────────────────────────
// 2) Types & Helpers
// ─────────────────────────────

type ApiResponse = {
  ok: boolean;
  preview: boolean;
  text?: string;
  audio_url?: string | null;
  messages_restants?: number | null;
  error?: string;
  error_code?: string;
};

function sendError(
  res: NextApiResponse<ApiResponse>,
  code: string,
  message: string,
  preview: boolean
) {
  return res.status(200).json({
    ok: false,
    preview,
    error: message,
    error_code: code,
    text: "",
    audio_url: null,
    messages_restants: null,
  });
}

// ─────────────────────────────
// 3) Handler principal
// ─────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== "GET") {
    return sendError(
      res,
      "METHOD_NOT_ALLOWED",
      "Only GET is allowed.",
      true
    );
  }

  // Params
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
  } = req.query as any;

  const isPreview = previewParam === "1" || previewParam === "true";
  const safeLang = lang === "en" ? "en" : "fr";

  if (!id) {
    return sendError(
      res,
      "MISSING_ID",
      safeLang === "en" ? "Missing jewel ID." : "ID de bijou manquant.",
      isPreview
    );
  }

  try {
    // ─────────────────────────────
    // 4) Récupération du bijou
    // ─────────────────────────────
    const { data: bijou, error: fetchError } = await supabase
      .from("bijous")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return sendError(
        res,
        "DB_ERROR",
        safeLang === "en" ? "Database error." : "Erreur base de données.",
        isPreview
      );
    }

    if (!bijou) {
      return sendError(
        res,
        "NOT_FOUND",
        safeLang === "en" ? "Jewel not found." : "Bijou introuvable.",
        isPreview
      );
    }

    // ─────────────────────────────
    // 5) Vérification crédit (si pas preview)
    // ─────────────────────────────
    if (!isPreview) {
      if (bijou.locked) {
        return sendError(
          res,
          "LOCKED",
          safeLang === "en"
            ? "This jewel is locked."
            : "Ce bijou est verrouillé.",
          false
        );
      }

      if (!bijou.paid) {
        return sendError(
          res,
          "UNPAID",
          safeLang === "en"
            ? "This jewel is not activated."
            : "Ce bijou n’est pas activé.",
          false
        );
      }

      if (bijou.messages_restants <= 0) {
        return sendError(
          res,
          "NO_CREDIT",
          safeLang === "en"
            ? "No whispers left."
            : "Plus de murmures restants.",
          false
        );
      }
    }

    // ─────────────────────────────
    // 6) Prompt IA
    // ─────────────────────────────
    const targetName = prenom || bijou.prenom || "";

    const fullPrompt = [
      safeLang === "en"
        ? `You are the invisible whisper linked to a wooden jewel.`
        : `Tu es le murmure invisible d’un bijou en bois, créé par un artisan.`,
      safeLang === "en"
        ? "Write in simple, intimate, poetic English."
        : "Écris en français simple, intimiste et poétique.",
      safeLang === "en"
        ? "Length: around one minute. No AI disclaimers."
        : "Longueur : environ une minute. Pas de mention d’IA.",
      theme ? `Theme: ${theme}` : "",
      sous_theme ? `Sub-theme: ${sous_theme}` : "",
      targetName ? `For: ${targetName}` : "",
      intention ? `Intent: ${intention}` : bijou.intention || "",
      detail ? `Detail: ${detail}` : bijou.detail || "",
    ]
      .filter(Boolean)
      .join("\n");

    // ─────────────────────────────
    // 7) Génération du texte
    // ─────────────────────────────

    let generatedText = "";

    try {
      const chat = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: fullPrompt },
          {
            role: "user",
            content: safeLang === "en" ? "Compose the whisper." : "Compose le murmure.",
          },
        ],
        temperature: 0.9,
        max_tokens: 600,
      });

      generatedText =
        chat.choices?.[0]?.message?.content?.trim() ||
        (safeLang === "en"
          ? "I am here, silent but present."
          : "Je suis là, silencieux mais présent.");
    } catch (err) {
      console.error(err);
      return sendError(
        res,
        "GENERATION_ERROR",
        safeLang === "en"
          ? "Error generating whisper."
          : "Erreur génération murmure.",
        isPreview
      );
    }

    // ─────────────────────────────
    // 8) PREVIEW → retour immédiat
    // ─────────────────────────────
    if (isPreview) {
      return res.status(200).json({
        ok: true,
        preview: true,
        text: generatedText,
        audio_url: null,
        messages_restants: bijou.messages_restants ?? null,
      });
    }

    // ─────────────────────────────
    // 9) TTS (audio) — optionnel
    // ─────────────────────────────

    let audio_url: string | null = null;

    try {
      const speech = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: voix === "masculine" ? "verse" : "alloy",
        input: generatedText,
      });

      // À implémenter plus tard : upload Supabase Storage
      audio_url = null;
    } catch (err) {
      console.error("TTS error:", err);
      audio_url = null;
    }

    // ─────────────────────────────
    // 10) Décrément
    // ─────────────────────────────

    const newRemaining =
      typeof bijou.messages_restants === "number"
        ? Math.max(0, bijou.messages_restants - 1)
        : null;

    await supabase.from("bijous").update({
      messages_restants: newRemaining,
      last_used_at: new Date().toISOString(),
      last_prenom: targetName || null,
      last_lang: safeLang,
      last_theme: theme || null,
      last_sous_theme: sous_theme || null,
    }).eq("id", id);

    // ─────────────────────────────
    // 11) Réponse finale
    // ─────────────────────────────

    return res.status(200).json({
      ok: true,
      preview: false,
      text: generatedText,
      audio_url,
      messages_restants: newRemaining,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return sendError(
      res,
      "UNEXPECTED_ERROR",
      safeLang === "en"
        ? "Unexpected error."
        : "Erreur inattendue.",
      isPreview
    );
  }
}
