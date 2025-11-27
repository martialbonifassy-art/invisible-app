// api/message.js
//
// Génère un murmure pour un bijou de la table "bijous"
// et met à jour : messages_restants, date_dernier_murmure.
// Gère la langue (fr/en), l'état (non configuré), et locked/messages épuisés.
// + Nettoie l'ancien format "Thème principal / Sous-thème / Texte libre fourni".

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mchqysvhgnlixyjeserv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHF5c3ZoZ25saXh5amVzZXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDE2OTYsImV4cCI6MjA3OTQxNzY5Nn0.vNE1iDPQeMls7RTqfFNS8Yxdlx_J2Jb9MgK4wcBtjWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

    // 1) Récup bijou
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
        text: "Je suis là, silencieux, mais présent pour toi. (Erreur de connexion à la base.)"
      });
    }

    if (!bijou) {
      return res.status(200).json({
        text: "Ce bijou n’est pas encore relié à sa voix. Contactez l’atelier si cela vous semble anormal."
      });
    }

    // 2) Langue effective
    const langueFromDb = (bijou.langue || "").toLowerCase();
    const langFromReq = (langParam || "").toLowerCase();
    const langue = langFromReq || langueFromDb || "fr";
    const isEn = langue === "en";

    // 3) Bijou non configuré ?
    const etat = (bijou.etat || "").toLowerCase();
    const estNonConfigure =
      etat.includes("non") && etat.includes("configur");

    if (estNonConfigure) {
      const text = isEn
        ? "This jewel has been created, but its whisper has not yet been written. Ask the artisan to personalize it, or use the dedicated page to configure it."
        : "Ce bijou a bien été créé, mais son murmure n’a pas encore été écrit. Demandez à l’atelier de le personnaliser, ou utilisez la page de personnalisation dédiée.";
      return res.status(200).json({ text });
    }

    // 4) locked / plus de murmures
    const locked = bijou.locked === true;
    const messagesRestants =
      typeof bijou.messages_restants === "number"
        ? bijou.messages_restants
        : null;

    if (locked) {
      const text = isEn
        ? "This jewel has completed its cycle of whispers. It now keeps silent, but remains close."
        : "Ce bijou a terminé son cycle de murmures. Il reste silencieux désormais, mais tout près de vous.";
      return res.status(200).json({ text });
    }

    if (messagesRestants !== null && messagesRestants <= 0) {
      const text = isEn
        ? "All whispers for this jewel have been used. Contact the Atelier des Liens Invisibles to recharge it."
        : "Tous les murmures de ce bijou ont été utilisés. Contactez l’Atelier des Liens Invisibles pour le recharger.";
      return res.status(200).json({ text });
    }

    // 5) Contexte du message (fusion URL + base)
    const prenom = prenomParam || bijou.prenom || "";
    const rawIntention = intentionParam || bijou.intention || "";
    const detail = detailParam || bijou.detail || "";
    let theme = bijou.theme || "";
    let sousTheme = bijou.sous_theme || "";
    const voix = (voixParam || bijou.voix || "neutre").toLowerCase();

    // ───────────────────────────────
    // 5bis) Nettoyage de l'ancien format :
    // "Thème principal : ... Sous-thème choisi : ... Texte libre fourni : ..."
    // ───────────────────────────────
    let intention = rawIntention;

    if (!theme && rawIntention.startsWith("Thème principal")) {
      const themeMatch = rawIntention.match(/Thème principal\s*:\s*(.+?)\s*Sous-thème/i);
      const sousThemeMatch = rawIntention.match(/Sous-thème(?: choisi)?\s*:\s*(.+?)\s*Personne concernée/i);
      const texteLibreMatch = rawIntention.match(/Texte libre fourni\s*:\s*(.+)$/i);

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

    // 6) Génération du murmure simple
    const texte = genererMurmureSimple({
      langue,
      prenom,
      intention,
      detail,
      theme,
      sousTheme,
      voix
    });

    // 7) Mise à jour des compteurs
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
      return res.status(200).json({ text: texte });
    }

    return res.status(200).json({ text: texte });
  } catch (e) {
    console.error("Erreur interne /api/message:", e);
    return res.status(200).json({
      text: "Je suis là, silencieux, mais présent pour toi. (Erreur interne.)"
    });
  }
}

// ─────────────────────────────────────────
// Générateur de murmure "simple"
// ─────────────────────────────────────────
function genererMurmureSimple({
  langue,
  prenom,
  intention,
  detail,
  theme,
  sousTheme,
  voix
}) {
  const nom = prenom || (langue === "en" ? "you" : "toi");

  if (langue === "en") {
    let base = `“${capitalizeFirst(nom)}, this whisper rises from the heart of the wood.`;

    if (theme) {
      base += ` It carries a note of ${theme.toLowerCase()}.`;
    }
    if (sousTheme) {
      base += ` More precisely: ${sousTheme.toLowerCase()}.`;
    }
    if (intention) {
      base += `\n\nWhat wants to be said today is: ${intention}`;
    }
    if (detail) {
      base += `\n\nIn the background, there is: ${detail}.`;
    }

    base += `\n\nEach time you call this jewel, it remembers you and answers in its own way.”`;
    return base;
  }

  // FR
  let base = `« ${capitalizeFirst(
    nom
  )}, ce murmure s’élève du cœur du bois.`;

  if (theme) {
    base += ` Il porte une nuance de ${theme.toLowerCase()}.`;
  }
  if (sousTheme) {
    base += ` Plus précisément : ${sousTheme.toLowerCase()}.`;
  }
  if (intention) {
    base += `\n\nCe qui cherche à se dire aujourd’hui : ${intention}`;
  }
  if (detail) {
    base += `\n\nEn filigrane, il y a : ${detail}.`;
  }

  base += `\n\nÀ chaque fois que tu appelles ce bijou, il se souvient de toi et répond à sa manière. »`;
  return base;
}

function capitalizeFirst(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
