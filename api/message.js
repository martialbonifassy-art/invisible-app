// api/message.js
//
// Génère un murmure poétique pour un bijou de la table "bijous"
// + décrémente messages_restants + met à jour date_dernier_murmure
// + génère un audio mp3 (TTS) à partir du texte.
//
// Style demandé : poétique & intime, adapté au thème.
// Langues : FR ou EN (FR par défaut).

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
        text: "Je suis là, silencieux, mais présent pour toi. (Erreur de connexion à la base.)",
        audio: null
      });
    }

    if (!bijou) {
      return res.status(200).json({
        text: "Ce bijou n’est pas encore relié à sa voix. Contactez l’atelier si cela vous semble anormal.",
        audio: null
      });
    }

    // ─────────────────────────────────────
    // 2) Langue effective
    // ─────────────────────────────────────
    const langueFromDb = (bijou.langue || "").toLowerCase();
    const langFromReq = (langParam || "").toLowerCase();
    const langue = langFromReq || langueFromDb || "fr";
    const isEn = langue === "en";

    // ─────────────────────────────────────
    // 3) Cas : bijou non configuré
    // ─────────────────────────────────────
    const etat = (bijou.etat || "").toLowerCase();
    const estNonConfigure =
      etat.includes("non") && etat.includes("configur");

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
    // 6) Générer le texte du murmure
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
    // 8) Générer l’audio (TTS OpenAI)
    // ─────────────────────────────────────
    let audioDataUrl = null;

    if (hasOpenAIKey()) {
      try {
        audioDataUrl = await generateSpeechFromText({
          texte,
          langue,
          voix
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
// ─────────────────────────────────────────
// Persona spécifique pour certains thèmes
// ─────────────────────────────────────────
function getThemePersona(langue, theme, sousTheme) {
  const t = (theme || "").toLowerCase();
  const st = (sousTheme || "").toLowerCase();
  const isEn = langue === "en";

  const FR = (s) => s;
  const EN = (fr, en) => (isEn ? en : fr);

  // 1) AMOUR – voix très intime, comme si le bijou connaissait vraiment l’histoire du couple
  if (t.includes("amour")) {
    return EN(
      "Tu parles comme si tu connaissais intimement la personne aimée et la relation, avec beaucoup de tact. Tu respectes la pudeur : tu n’es jamais vulgaire ni trop explicite. Tu ajustes ton ton pour que cela puisse être reçu comme un cadeau discret, même si quelqu’un lit le murmure à voix basse.",
      "You speak as if you know the beloved person and the relationship intimately, with great tact. You respect modesty: you are never vulgar or too explicit. You adapt your tone so that it can be received as a discreet gift, even if someone reads the whisper softly aloud."
    );
  }

  // 2) GUÉRISON & APAISEMENT – voix couverture, très enveloppante
  if (t.includes("guérison") || t.includes("guerison") || t.includes("apaisement")) {
    return EN(
      "Tu parles comme une couverture posée sur les épaules : tu ne cherches pas à donner des leçons, seulement à soutenir. Tu accueilles la fragilité sans jugement, et tu la transformes en douceur, en respiration, en présence.",
      "You speak like a blanket placed over the shoulders: you do not try to teach lessons, you only support. You welcome fragility without judgment and turn it into gentleness, breathing and presence."
    );
  }

  // 3) RÊVES & NUIT – voix onirique, pré-endormissement
  if (t.includes("rêves") || t.includes("reves") || t.includes("nuit")) {
    return EN(
      "Tu parles comme juste avant de s’endormir : un peu ralenti, presque en chuchotant. Tes images sont oniriques : ciel nocturne, constellations, lune, brume douce. Tu invites la personne à laisser la journée derrière elle.",
      "You speak as if it were just before falling asleep: a bit slower, almost whispering. Your images are dreamlike: night sky, constellations, moon, soft mist. You invite the person to leave the day behind."
    );
  }

  // 4) GARDIEN DU BOIS – thème signature, voix d’esprit ancien
  if (t.includes("gardien") || t.includes("bois")) {
    return EN(
      "Tu parles comme un esprit ancien du bois, qui a vu passer des générations. Ta voix est calme, un peu grave, pleine de patience. Tu évoques les anneaux du tronc, les racines, la sève, les saisons qui reviennent. Tu restes toutefois simple et accessible, jamais ésotérique de façon forcée.",
      "You speak like an ancient spirit of the wood, who has seen generations pass. Your voice is calm, slightly deep, and patient. You evoke tree rings, roots, sap and returning seasons. However, you remain simple and accessible, never forcedly esoteric."
    );
  }

  // 5) ÉNERGIE & VITALITÉ – voix plus ensoleillée
  if (
    t.includes("énergie") ||
    t.includes("energie") ||
    t.includes("vitalité") ||
    t.includes("vitalite")
  ) {
    return EN(
      "Tu parles comme un rayon de soleil qui entre dans une pièce : lumineux, dynamique, mais sans mettre la pression. Tu encourages doucement la personne à se remettre en mouvement, à se souvenir de ce qui la rend vivante.",
      "You speak like a sunbeam entering a room: bright and dynamic, but without putting pressure. You gently encourage the person to move again and remember what makes them feel alive."
    );
  }

  // Persona par défaut (pour les autres thèmes)
  return EN(
    "Tu parles comme une présence attentive et bienveillante qui vit dans le bijou, avec un ton simple et humain.",
    "You speak like a caring, attentive presence living inside the jewel, with a simple and human tone."
  );
}

  const t = (theme || "").toLowerCase();
  const st = (sousTheme || "").toLowerCase();

  const isEn = langue === "en";
  const EN = (fr, en) => (isEn ? en : fr);

  // AMOUR
  if (t.includes("amour")) {
    return EN(
      "Style : très intime, tendre, presque chuchoté à l’oreille. Laisse beaucoup de place aux sensations, à la douceur des gestes, à la vulnérabilité.",
      "Style: very intimate and tender, almost whispered into the ear. Focus on sensations, gentle gestures and vulnerability."
    );
  }

  // GRATITUDE
  if (t.includes("gratitude")) {
    return EN(
      "Style : reconnaissant, chaleureux, avec des images simples qui mettent en lumière les gestes invisibles et la présence de l’autre.",
      "Style: warm and thankful, with simple images that highlight invisible gestures and the presence of the other person."
    );
  }

  // GUÉRISON & APAISEMENT
  if (t.includes("guérison") || t.includes("guerison") || t.includes("apaisement")) {
    return EN(
      "Style : très doux, enveloppant, comme une main posée sur l’épaule. Les phrases peuvent être un peu plus lentes, avec une respiration calme.",
      "Style: very soft and soothing, like a hand resting on the shoulder. Sentences can be slower, with a calm breathing rhythm."
    );
  }

  // CHEMIN DE VIE
  if (t.includes("chemin") || t.includes("orientation")) {
    return EN(
      "Style : clair et doux à la fois, comme une lanterne dans la nuit. Utilise des métaphores de chemins, de carrefours, de portes qui s’ouvrent.",
      "Style: clear and gentle at the same time, like a lantern in the night. Use metaphors of paths, crossroads and doors opening."
    );
  }

  // COURAGE & DÉPASSEMENT
  if (t.includes("courage") || t.includes("dépassement") || t.includes("depassement")) {
    return EN(
      "Style : encourageant, solide, mais sans agressivité. On sent une force calme qui dit : « tu peux » sans crier.",
      "Style: encouraging and steady, but never aggressive. A calm strength that says “you can do this” without shouting."
    );
  }

  // CRÉATIVITÉ
  if (t.includes("créativité") || t.includes("creativite") || t.includes("inspiration")) {
    return EN(
      "Style : imagé, ludique, avec des métaphores artistiques ou oniriques. Autorise une légère fantaisie dans les images.",
      "Style: imaginative and playful, with artistic or dreamlike metaphors. Allow a bit of fantasy in the imagery."
    );
  }

  // RÊVES & NUIT
  if (t.includes("rêves") || t.includes("reves") || t.includes("nuit")) {
    return EN(
      "Style : nocturne, doux, presque chuchoté à la lueur d’une veilleuse. Utilise des images de nuit, de ciel, de brumes légères.",
      "Style: nocturnal, gentle, almost whispered in dim light. Use images of night, sky and soft mists."
    );
  }

  // PRÉSENCE & PLEINE CONSCIENCE
  if (t.includes("présence") || t.includes("presence") || t.includes("pleine conscience")) {
    return EN(
      "Style : très ancré dans le corps et la respiration. Invite à sentir les mains, le cœur, le souffle, le contact avec la matière.",
      "Style: very grounded in body and breath. Invite the listener to feel hands, heart, breathing and contact with matter."
    );
  }

  // GARDIEN DU BOIS
  if (t.includes("gardien") || t.includes("bois")) {
    return EN(
      "Style : un peu plus archaïque et naturel, comme une ancienne présence qui parle depuis les anneaux du bois. Utilise le vocabulaire de la forêt, des racines, de la sève, sans en faire trop.",
      "Style: slightly more ancient and natural, like an old presence speaking from the rings of the wood. Use vocabulary of forest, roots, sap, without overdoing it."
    );
  }

  // CYCLES & RENOUVEAU
  if (t.includes("cycle") || t.includes("renouveau")) {
    return EN(
      "Style : cyclique et doux, avec des images de saisons, de marées, de respiration longue. On sent que tout commence et recommence.",
      "Style: cyclic and gentle, with images of seasons, tides and long breathing. We feel that everything begins and begins again."
    );
  }

  // INTUITION & SYNCHRONICITÉS
  if (t.includes("intuition") || t.includes("synchronicit")) {
    return EN(
      "Style : légèrement mystérieux, mais toujours rassurant. Parle de signes, de coïncidences, de petites lumières sur le chemin.",
      "Style: slightly mysterious but still reassuring. Speak of signs, coincidences and small lights on the path."
    );
  }

  // PROJETS & OBJECTIFS
  if (t.includes("projets") || t.includes("objectifs") || t.includes("objectif")) {
    return EN(
      "Style : structurant mais sensible, comme un carnet de route écrit avec douceur. Parle de pas après pas, de vision, de constance.",
      "Style: structured yet sensitive, like a roadmap written gently. Speak of step-by-step movement, vision and consistency."
    );
  }

  // CÉLÉBRATION & JOIE
  if (t.includes("célébration") || t.includes("celebration") || t.includes("joie")) {
    return EN(
      "Style : lumineux, joyeux sans être exagéré. Comme un sourire sincère qui s’entend. Utilise quelques images de fête, de lumière, de rires.",
      "Style: bright and joyful without being exaggerated, like a smile you can hear. Use a few images of celebration, light and laughter."
    );
  }

  // CALME & SÉRÉNITÉ
  if (t.includes("calme") || t.includes("sérénité") || t.includes("serenite")) {
    return EN(
      "Style : très paisible, presque comme une berceuse pour adulte. Phrases simples, rythme lent, beaucoup d’espace.",
      "Style: very peaceful, almost like a lullaby for adults. Simple sentences, slow rhythm and lots of space."
    );
  }

  // CONNEXION & LIEN
  if (t.includes("connexion") || t.includes("lien")) {
    return EN(
      "Style : relationnel, tourné vers le « nous ». Parle de fils invisibles, de ponts, de gestes qui relient.",
      "Style: relational, oriented towards “we”. Speak of invisible threads, bridges and gestures that connect."
    );
  }

  // CONFIANCE EN SOI
  if (t.includes("confiance")) {
    return EN(
      "Style : encourageant et lumineux, mais sans injonctions. On sent qu’une présence croit profondément en la personne.",
      "Style: encouraging and bright, but without pressure. We feel that a presence deeply believes in the person."
    );
  }

  // DIFFICULTÉS
  if (t.includes("difficult") || t.includes("épreuves") || t.includes("epreuves")) {
    return EN(
      "Style : sobre, solide, sans nier la difficulté. Tout le texte est comme une main qui ne lâche pas.",
      "Style: sober and steady, without denying the difficulty. The whole text feels like a hand that does not let go."
    );
  }

  // ALIGNEMENT & AUTHENTICITÉ
  if (t.includes("alignement") || t.includes("authenticit")) {
    return EN(
      "Style : honnête, clair, presque cristallin. Parle de vérité intérieure, de voix propre, de chemin singulier.",
      "Style: honest and clear, almost crystalline. Speak of inner truth, one’s own voice and a singular path."
    );
  }

  // RACINES & ORIGINES
  if (t.includes("racines") || t.includes("origines")) {
    return EN(
      "Style : légèrement nostalgique, doux, tourné vers le passé et ce qui a construit la personne. Images d’enfance, de terre, de maison.",
      "Style: slightly nostalgic and gentle, turned towards the past and what has shaped the person. Images of childhood, earth and home."
    );
  }

  // ÉNERGIE & VITALITÉ
  if (
    t.includes("énergie") ||
    t.includes("energie") ||
    t.includes("vitalité") ||
    t.includes("vitalite")
  ) {
    return EN(
      "Style : plus dynamique, tonique, comme un rayon de soleil qui entre dans une pièce. Reste doux mais vivant.",
      "Style: more dynamic and tonic, like a sunbeam entering a room. Stay gentle but lively."
    );
  }

  // Par défaut
  return EN(
    "Style : intime, doux, poétique, avec quelques images liées au bois, au souffle et à la lumière.",
    "Style: intimate, soft and poetic, with a few images related to wood, breath and light."
  );
}

// ─────────────────────────────────────────
// IA poétique (OpenAI / chat completions)
// ─────────────────────────────────────────
async function generatePoeticWhisperWithOpenAI({
  langue,
  prenom,
  intention,
  detail,
  theme,
  sousTheme
}) {
  const isEn = langue === "en";
  const name = prenom || (isEn ? "you" : "toi");
  const styleHints = getThemeStyleHints(theme, sousTheme, langue);

  const system = isEn
    ? "You are a gentle, poetic voice living inside a wooden jewel. You write short, intimate whispers (5 to 9 short lines), in a soft, emotional and delicate style. You never mention that you are an AI, nor that this is a message or a text. You speak as if the jewel itself were addressing the person. The presence of wood is subtle: sometimes you evoke grain, warmth, breath, rings of time, but never in a heavy or repetitive way."
    : "Tu es une voix douce et poétique qui habite dans un bijou en bois. Tu écris de courts murmures intimes (entre 5 et 9 lignes courtes), dans un style délicat, sensible et chaleureux. Tu ne mentionnes jamais que tu es une IA, ni que ceci est un message ou un texte. Tu parles comme si le bijou lui-même s’adressait à la personne. La présence du bois est subtile : parfois tu évoques le grain, la chaleur, le souffle, les anneaux du temps, mais jamais de façon lourde ou répétitive.";

  const userPrompt = isEn
    ? `Write a poetic whisper for ${name}.

Context:
- Main theme: ${theme || "not specified"}
- Sub-theme: ${sousTheme || "not specified"}
- Intention or situation: ${intention || "not specified"}
- Detail or memory to weave in: ${detail || "none"}

Style guidance:
${styleHints}

Constraints:
- Tone: intimate, gentle, soft, with emotional depth.
- 5 to 9 short lines (line breaks are allowed and welcome).
- The jewel speaks in the first person or as a very close presence (for example: "I", "I am here", "I remember…").
- Do not repeat the bullet list above, transform everything into an organic, flowing text.
- Avoid explaining, prefer evoking with concrete and sensory images.`
    : `Écris un murmure poétique pour ${name}.

Contexte :
- Thème principal : ${theme || "non précisé"}
- Sous-thème : ${sousTheme || "non précisé"}
- Intention ou situation : ${intention || "non précisé"}
- Détail ou souvenir à tisser : ${detail || "aucun"}

Style :
${styleHints}

Contraintes :
- Ton : intime, doux, avec de la profondeur émotionnelle.
- Entre 5 et 9 lignes courtes (les retours à la ligne sont bienvenus).
- Le bijou parle à la première personne ou comme une présence très proche (par exemple : « je », « je suis là », « je me souviens… »).
- Ne répète pas la liste ci-dessus, transforme tout en un texte organique, fluide.
- Évite d’expliquer ; privilégie les images concrètes, sensorielles et les sensations.`;

  const body = {
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.95,
    max_tokens: 400
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(
      `Erreur OpenAI chat (${resp.status}): ${errText.slice(0, 200)}`
    );
  }

  const data = await resp.json();
  const content =
    data.choices?.[0]?.message?.content?.trim() ||
    (isEn
      ? "I am here, silently, but present for you."
      : "Je suis là, silencieux, mais présent pour toi.");
  return content;
}

// ─────────────────────────────────────────
// Générateur simple (fallback sans IA)
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
      base += ` It carries a shade of ${theme}.`;
    }
    if (sousTheme) {
      base += ` More precisely: ${sousTheme}.`;
    }
    if (intention) {
      base += `\n\nWhat wants to be said today is: ${intention}.`;
    }
    if (detail) {
      base += `\n\nIn the background, there is this memory: ${detail}.`;
    }

    base += `\n\nEach time you call this jewel, it remembers you and answers in its own way.”`;
    return base;
  }

  // FR
  let base = `« ${capitalizeFirst(
    nom
  )}, ce murmure s’élève du cœur du bois.`;

  if (theme) {
    const t = theme.trim();
    const lower = t.toLowerCase();
    const startsWithVowel = /^[aeiouyhàâäáãéèêëîïíìôöóòúùûü]/i.test(lower);
    const prep = startsWithVowel ? "d’" : "de ";
    base += ` Il porte une nuance ${prep}${t}.`;
  }

  if (sousTheme) {
    base += ` Plus précisément : ${sousTheme}.`;
  }

  if (intention) {
    base += `\n\nCe qui cherche à se dire aujourd’hui, c’est ${intention}.`;
  }

  if (detail) {
    base += `\n\nEn filigrane, il y a ce souvenir : ${detail}.`;
  }

  base += `\n\nÀ chaque fois que tu appelles ce bijou, il se souvient de toi et répond à sa manière. »`;
  return base;
}

function capitalizeFirst(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─────────────────────────────────────────
// Génération de l’audio (TTS OpenAI)
// ─────────────────────────────────────────
async function generateSpeechFromText({ texte, langue, voix }) {
  if (!texte || !OPENAI_API_KEY) return null;

  // Choix d’une voix
  let voiceName = "alloy"; // neutre
  if (voix === "feminine" || voix === "féminine") {
    voiceName = "nova";
  } else if (voix === "masculine" || voix === "masculine") {
    voiceName = "onyx";
  }

  const body = {
    model: "tts-1",
    voice: voiceName,
    input: texte
  };

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(
      `Erreur OpenAI audio (${resp.status}): ${errText.slice(0, 200)}`
    );
  }

  const arrayBuffer = await resp.arrayBuffer();
  const base64Audio = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl = `data:audio/mp3;base64,${base64Audio}`;
  return dataUrl;
}
