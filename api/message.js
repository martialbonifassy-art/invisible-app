// api/message.js
//
// Génère un murmure pour un bijou + met à jour la base :
// - vérifie messages_restants / locked
// - décrémente messages_restants
// - met à jour date_dernier_murmure
// - gère la langue (fr / en)
// Ici, le texte est généré avec un template simple (pas encore d'appel IA).

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

    // ─────────────────────────────────────────
    // Récupérer le bijou en base
    // ─────────────────────────────────────────
    const { data: bijou, error: fetchError } = await supabase
      .from("bijoux")
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
        locked
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("Erreur récupération bijou:", fetchError);
      // On ne bloque pas forcément l'affichage : on renvoie un murmure générique
      return res.status(200).json({
        text:
          "Je suis là, silencieux, mais présent pour toi. (Erreur de connexion à la base.)"
      });
    }

    // Si le bijou n'existe pas encore en base :
    if (!bijou) {
      // On ne casse pas la démo pour TEST001 / TEST002 : murmure générique
      const texte = `« Je suis un murmure de démo, encore non relié à la base. »`;
      return res.status(200).json({ text: texte });
    }

    // ─────────────────────────────────────────
    // Gestion de la langue
    // ─────────────────────────────────────────
    const langueFromDb = (bijou.langue || "").toLowerCase();
    const langFromReq = (langParam || "").toLowerCase();
    const langueEffective = langFromReq || langueFromDb || "fr";

    // ─────────────────────────────────────────
    // Contrôles : locked / messages_restants
    // ─────────────────────────────────────────
    const locked = bijou.locked === true;
    const messagesRestants =
      typeof bijou.messages_restants === "number"
        ? bijou.messages_restants
        : null;

    if (locked) {
      const text =
        langueEffective === "en"
          ? "This jewel has completed its cycle of murmurs. It now keeps silent, but stays close."
          : "Ce bijou a terminé son cycle de murmures. Il reste silencieux, mais tout près.";
      return res.status(200).json({ text });
    }

    if (messagesRestants !== null && messagesRestants <= 0) {
      const text =
        langueEffective === "en"
          ? "All murmurs for this jewel have been used. Contact the artisan to recharge it."
          : "Tous les murmures de ce bijou ont été utilisés. Contactez l’atelier pour le recharger.";
      return res.status(200).json({ text });
    }

    // ─────────────────────────────────────────
    // Construire les données "logiques" du message
    // (on combine ce qui vient du client et ce qui est déjà en base)
    // ─────────────────────────────────────────
    const prenom = prenomParam || bijou.prenom || "";
    const intention = intentionParam || bijou.intention || "";
    const detail = detailParam || bijou.detail || "";
    const theme = bijou.theme || "";
    const sousTheme = bijou.sous_theme || "";
    const voix = (voixParam || bijou.voix || "neutre").toLowerCase();

    // ─────────────────────────────────────────
    // Génération d’un texte de murmure SIMPLE (sans IA pour l'instant)
    // ─────────────────────────────────────────
    const texte = genererMurmureSimple({
      langue: langueEffective,
      prenom,
      intention,
      detail,
      theme,
      sousTheme,
      voix
    });

    // ─────────────────────────────────────────
    // Mise à jour de la base : messages_restants & date_dernier_murmure
    // ─────────────────────────────────────────
    const now = new Date().toISOString();

    let nouveauSolde = messagesRestants;
    if (messagesRestants !== null) {
      nouveauSolde = Math.max(messagesRestants - 1, 0);
    }

    const { error: updateError } = await supabase
      .from("bijoux")
      .update({
        langue: langueEffective,
        messages_restants: nouveauSolde,
        date_dernier_murmure: now
      })
      .eq("id", id);

    if (updateError) {
      console.error("Erreur update messages_restants:", updateError);
      // On ne bloque pas le retour du texte pour l'utilisateur :
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
// Fonction de génération d’un murmure simple
// (placeholder avant branchement OpenAI)
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
    let base = `“${capitalizeFirst(nom)}, this whisper comes from the heart of the wood.`;

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
      base += `\n\nA quiet thread links back to: ${detail}.`;
    }

    base += `\n\nEach time you call this jewel, it remembers you and answers in its own way.”`;

    return base;
  }

  // FR
  let base = `« ${capitalizeFirst(nom)}, ce murmure vient du cœur du bois.`;

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
    base += `\n\nUn fil discret te relie à : ${detail}.`;
  }

  base += `\n\nÀ chaque fois que tu appelles ce bijou, il se souvient de toi et répond à sa manière. »`;

  return base;
}

function capitalizeFirst(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
