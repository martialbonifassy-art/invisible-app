// /pages/api/message.ts   (Next.js Pages Router)
// ou /app/api/message/route.ts à adapter (req/res changent légèrement)

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
// 2) Contrat JSON unique
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

function sendError(
  res: NextApiResponse<MessageResponse>,
  _status: number, // on ne s’en sert plus
  code: string,
  message: string,
  preview: boolean
) {
  // 🔒 Toujours status 200 pour ne jamais déclencher le catch côté front
  return res.status(200).json({
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
    // 5) Vérifier crédit / état (seulement si PAS preview)
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
    // 6) Construire le prompt
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
          ? `Main theme: ${effectiveTheme || "-"}, sub-theme: ${
              effectiveSousTheme || "-"
            }.`
          : `Thème principal : ${effectiveTheme || "-"}, sous-thème : ${
              effectiveSousTheme || "-"
            }.`
        : "";

    const intentionLine =
      intention || bijou.intention
        ? safeLang === "en"
          ? `Extra instructions from the giver: ${intention || bijou.intention}.`
          : `Instructions supplémentaires de la personne qui offre : ${
              intention || bijou.intention
            }.`
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
        ? "Length: about 1 to 2 spoken minutes. No introduction about being an AI."
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
    // 7) Génération texte
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
    // 8) MODE PREVIEW : pas de décrément, pas d’audio
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
    // 9) TTS optionnel (audio_url peut rester null)
    // ─────────────────────────────

    let audioUrl: string | null = null;

    try {
      const speech = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice:
          voix === "feminine"
            ? "alloy"
            : voix === "masculine"
            ? "verse"
            : "alloy",
        input: generatedText,
      });

      // Ici tu pourras plus tard uploader le buffer dans Supabase Storage / S3
      // et remplir audioUrl avec l’URL publique.
      audioUrl = null;
    } catch (err) {
      console.error("TTS error:", err);
      audioUrl = null;
    }

    // ─────────────────────────────
    // 10) Décrément des crédits (uniquement hors preview)
    // ─────────────────────────────

    let remaining = bijou.messages_restants;
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
      console.error("Update bijou error:", updateError);
      // on ne bloque pas pour l’utilisateur
    }

    return res.status(200).json({
      ok: true,
      preview: false,
      text: generatedText,
      audio_url: audioUrl,
      remaining: typeof remaining === "number" ? remaining : undefined,
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
