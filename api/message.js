// /api/message.js
// Fonction serverless Vercel en CommonJS (Node)

const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

// ─────────────────────────────
// 1) Config Supabase + OpenAI
// ─────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("[/api/message] Missing Supabase env vars");
}
if (!OPENAI_API_KEY) {
  console.error("[/api/message] Missing OPENAI_API_KEY env var");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ─────────────────────────────
// 2) Helper: réponse d’erreur
// ─────────────────────────────

function sendError(res, status, code, message, preview) {
  console.error("[/api/message] error:", status, code, message);

  // On répond toujours en JSON avec le même contrat
  res.status(status).json({
    ok: false,
    preview: !!preview,
    error_code: code,
    error: message,
  });
}

// ─────────────────────────────
// 3) Handler principal
// ─────────────────────────────

module.exports = async function handler(req, res) {
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
  } = req.query || {};

  const isPreview = previewParam === "1" || previewParam === "true";

  if (!id) {
    const msg =
      lang === "en" ? "Missing jewel ID." : "ID de bijou manquant.";
    return sendError(res, 400, "MISSING_ID", msg, isPreview);
  }

  const safeLang = lang === "en" ? "en" : "fr";

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
      const msg =
        safeLang === "en"
          ? "Error while fetching the jewel."
          : "Erreur lors de la récupération du bijou.";
      return sendError(res, 500, "DB_ERROR", msg, isPreview);
    }

    if (!bijou) {
      const msg =
        safeLang === "en"
          ? "No jewel found with this ID."
          : "Aucun bijou trouvé avec cet ID.";
      return sendError(res, 404, "NOT_FOUND", msg, isPreview);
    }

    // ─────────────────────────────
    // 5) Vérifier crédit / état (si PAS preview)
    // ─────────────────────────────
    if (!isPreview) {
      if (bijou.locked) {
        const msg =
          safeLang === "en"
            ? "This jewel is locked. Please contact the Atelier."
            : "Ce bijou est verrouillé. Merci de contacter l’Atelier.";
        return sendError(res, 403, "LOCKED", msg, false);
      }

      // Si tu veux que les bijoux non payés fonctionnent quand même,
      // commente ce bloc "UNPAID".
      if (bijou.paid === false) {
        const msg =
          safeLang === "en"
            ? "This jewel has not been activated yet."
            : "Ce bijou n’a pas encore été activé.";
        return sendError(res, 402, "UNPAID", msg, false);
      }

      if (
        typeof bijou.messages_restants === "number" &&
        bijou.messages_restants <= 0
      ) {
        const msg =
          safeLang === "en"
            ? "No whispers left on this jewel."
            : "Il ne reste plus de murmures sur ce bijou.";
        return sendError(res, 403, "NO_CREDIT", msg, false);
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
      console.error("[/api/message] OpenAI text error:", err);
      const msg =
        safeLang === "en"
          ? "Error while generating the whisper."
          : "Erreur lors de la génération du murmure.";
      return sendError(res, 500, "GENERATION_ERROR", msg, isPreview);
    }

    // ─────────────────────────────
    // 8) Mode preview → pas de décrément
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
      console.error("[/api/message] Update bijou error:", updateError);
      // on ne bloque pas la réponse pour ça
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
    const msg =
      safeLang === "en"
        ? "Unexpected error while generating the whisper."
        : "Erreur inattendue lors de la génération du murmure.";
    return sendError(res, 500, "UNEXPECTED_ERROR", msg, isPreview);
  }
};
