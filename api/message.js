// api/message.js
//
// Génère un murmure poétique pour un bijou de la table "bijous"
// + décrémente messages_restants + met à jour date_dernier_murmure
// + génère un audio mp3 (TTS) à partir du texte.
//
// Style : poétique & intime, adapté au thème (style + persona).
// Langues : FR ou EN (FR par défaut, mais fallback EN si le navigateur est en anglais).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Clé OpenAI dans les variables d'env Vercel (OPENAI_API_KEY)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function hasOpenAIKey() {
  return typeof OPENAI_API_KEY === "string" && OPENAI_API_KEY.trim().length > 0;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const {
      id,
      prenom: prenomParam,
      intention: intentionParam,
      detail: detailParam,
      voix: voixParam,
      lang: langParam
    } = req.query || {};

    if (!id) {
      return res.status(400).json({ error: "ID du bijou manquant." });
    }

    // ─────────────────────────────────────
    // 1) Récupération du bijou
    // ─────────────────────────────────────
    const { data: bijou, error: fetchError } = await supabase
      .from("bijous")
      .select(
        `
        id,
        prenom,
        intention,
        detail,
        theme,
        sous_theme,
        voix,
        langue,
        messages_restants,
        messages_max,
        locked,
        etat
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("Erreur récupération bijou:", fetchError);
      return res.status(200).json({
        text:
          "Je suis là, silencieux, mais présent pour toi. (Erreur de connexion à la base.)",
        audio: null
      });
    }

    if (!bijou) {
      return res.status(200).json({
        text:
          "Ce bijou n’est pas encore relié à sa voix. Contactez l’atelier si cela vous semble anormal.",
        audio: null
      });
    }

    // ─────────────────────────────────────
    // 2) Langue effective avec FALBACK EN
    // ─────────────────────────────────────
    const langueFromDb = (bijou.langue || "").toLowerCase();
    const langFromReq = (langParam || "").toLowerCase();

    const acceptLangHeader = (req.headers["accept-language"] || "").toLowerCase();
    const browserIsEn = /^en\b/.test(acceptLangHeader);

    let langue;
    if (langFromReq) {
      langue = langFromReq;              // priorité à la requête (bijou-en.html, etc.)
    } else if (langueFromDb) {
      langue = langueFromDb;             // ensuite la langue stockée en base
    } else if (browserIsEn) {
      langue = "en";                     // fallback : navigateur en anglais → EN
    } else {
      langue = "fr";                     // sinon → FR
    }

    const isEn = langue === "en";

    // ─────────────────────────────────────
    // 3) Cas : bijou non configuré
    // ─────────────────────────────────────
    const etat = (bijou.etat || "").toLowerCase();
    const estNonConfigure = etat.includes("non") && etat.includes("configur");

    if (estNonConfigure) {
      const text = isEn
        ? "This jewel has been created, but its whisper has not yet been written. Ask the artisan to personalize it, or use the dedicated page to configure it."
        : "Ce bijou a bien été créé, mais son murmure n’a pas encore été écrit. Demandez à l’atelier de le personnaliser, ou utilisez la page de personnalisation dédiée.";
      return res.status(200).json({ text, audio: null });
    }

    // ─────────────────────────────────────
    // 4) Cas : locked ou plus de murmures
    // ─────────────────────────────────────
    const locked = bijou.locked === true;
    const messagesRestants =
      typeof bijou.messages_restants === "number"
        ? bijou.messages_restants
        : null;

    if (locked) {
      const text = isEn
        ? "This jewel has completed its cycle of whispers. It now keeps silent, but remains close."
        : "Ce bijou a terminé son cycle de murmures. Il reste silencieux désormais, mais tout près de vous.";
      return res.status(200).json({ text, audio: null });
    }

    if (messagesRestants !== null && messagesRestants <= 0) {
      const text = isEn
        ? "All whispers for this jewel have been used. Contact the Atelier des Liens Invisibles to recharge it."
        : "Tous les murmures de ce bijou ont été utilisés. Contactez l’Atelier des Liens Invisibles pour le recharger.";
      return res.status(200).json({ text, audio: null });
    }

    // ─────────────────────────────────────
    // 5) Contexte du message (fusion URL + base)
    // ─────────────────────────────────────
    const prenom = prenomParam || bijou.prenom || "";
    const rawIntention = intentionParam || bijou.intention || "";
    const detail = detailParam || bijou.detail || "";
    let theme = bijou.theme || "";
    let sousTheme = bijou.sous_theme || "";
    const voix = (voixParam || bijou.voix || "neutre").toLowerCase();

    let intention = rawIntention;

    // Nettoyage ancien format "Thème principal / Sous-thème / Texte libre fourni"
    if (!theme && rawIntention && rawIntention.startsWith("Thème principal")) {
      const themeMatch = rawIntention.match(
        /Thème principal\s*:\s*(.+?)\s*Sous-thème/i
      );
      const sousThemeMatch = rawIntention.match(
        /Sous-thème(?: choisi)?\s*:\s*(.+?)\s*Personne concernée/i
      );
      const texteLibreMatch = rawIntention.match(
        /Texte libre fourni\s*:\s*(.+)$/i
      );

      if (themeMatch && themeMatch[1]) {
        theme = themeMatch[1].trim();
      }
      if (sousThemeMatch && sousThemeMatch[1]) {
        sousTheme = sousThemeMatch[1].trim();
      }
      if (texteLibreMatch && texteLibreMatch[1]) {
        intention = texteLibreMatch[1].trim();
      }
    }

    // ─────────────────────────────────────
    // 6) Générer le texte du murmure (IA ou fallback)
    // ─────────────────────────────────────
    let texte;

    if (hasOpenAIKey()) {
      try {
        texte = await generatePoeticWhisperWithOpenAI({
          langue,
          prenom,
          intention,
          detail,
          theme,
          sousTheme
        });
      } catch (err) {
        console.error("Erreur OpenAI texte, fallback simple:", err);
        texte = genererMurmureSimple({
          langue,
          prenom,
          intention,
          detail,
          theme,
          sousTheme,
          voix
        });
      }
    } else {
      // Pas de clé OpenAI → générateur simple
      texte = genererMurmureSimple({
        langue,
        prenom,
        intention,
        detail,
        theme,
        sousTheme,
        voix
      });
    }

    // ─────────────────────────────────────
    // 7) Mise à jour Supabase
    // ─────────────────────────────────────
    const now = new Date().toISOString();
    let nouveauSolde = messagesRestants;
    if (messagesRestants !== null) {
      nouveauSolde = Math.max(messagesRestants - 1, 0);
    }

    const { error: updateError } = await supabase
      .from("bijous")
      .update({
        langue,
        messages_restants: nouveauSolde,
        date_dernier_murmure: now,
        theme: theme || null,
        sous_theme: sousTheme || null,
        intention: intention || rawIntention || null
      })
      .eq("id", id);

    if (updateError) {
      console.error("Erreur update messages_restants:", updateError);
      // on continue malgré tout
    }

    // ─────────────────────────────────────
    // 8) Générer l’audio (TTS OpenAI) avec voix selon thème
    // ─────────────────────────────────────
    let audioDataUrl = null;

    if (hasOpenAIKey()) {
      try {
        audioDataUrl = await generateSpeechFromText({
          texte,
          langue,
          voix,
          theme,
          sousTheme
        });
      } catch (err) {
        console.error("Erreur OpenAI audio, on renvoie juste le texte:", err);
      }
    }

    // ─────────────────────────────────────
    // 9) Réponse finale
    // ─────────────────────────────────────
    return res.status(200).json({
      text: texte,
      audio: audioDataUrl
    });
  } catch (e) {
    console.error("Erreur interne /api/message:", e);
    return res.status(200).json({
      text: "Je suis là, silencieux, mais présent pour toi. (Erreur interne.)",
      audio: null
    });
  }
}

// ─────────────────────────────────────────
// Aide : style selon le thème
// ─────────────────────────────────────────
function getThemeStyleHints(theme, sousTheme, langue) {
  const t = (theme || "").toLowerCase();
  const isEn = langue === "en";
  const EN = (fr, en) => (isEn ? en : fr);

  // … [TOUT LE RESTE INCHANGÉ : getThemeStyleHints, getThemePersona,
  //    generatePoeticWhisperWithOpenAI, genererMurmureSimple,
  //    capitalizeFirst, pickVoiceName, generateSpeechFromText]
  // ⚠️ Garde exactement ton code existant pour ces fonctions.
}
