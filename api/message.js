// api/message.js
//
// Génère un murmure poétique pour un bijou de la table "bijous"
// + décrémente messages_restants + met à jour date_dernier_murmure
// + génère un audio mp3 (TTS) à partir du texte.
//
// Style : poétique & intime, adapté au thème (style + persona).
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
      audio: audioDataUrl,
      id,                          // ID interne du bijou
      lang: langue,                // langue effective utilisée
      messages_restants: nouveauSolde,
      messages_max: bijou.messages_max ?? null
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

  // AMOUR
  if (t.includes("amour")) {
    return EN(
      "Style : très intime, tendre, presque chuchoté à l’oreille. Décris des gestes simples, des souvenirs partagés, des petits détails qui n’appartiennent qu’à eux. Le ton est vulnérable, sincère, sans ironie.",
      "Style: very intimate and tender, almost whispered into the ear. Describe simple gestures, shared memories and small details that belong only to them. The tone is vulnerable, sincere and without irony."
    );
  }

  // GRATITUDE
  if (t.includes("gratitude")) {
    return EN(
      "Style : reconnaissant, chaleureux, centré sur le ‘merci’ incarné. Mets en lumière les gestes discrets, les présences silencieuses, les soutiens qui ont compté.",
      "Style: warm and thankful, centered on embodied ‘thank you’. Highlight discreet gestures, silent presences and support that truly mattered."
    );
  }

  // GUÉRISON & APAISEMENT
  if (t.includes("guérison") || t.includes("guerison") || t.includes("apaisement")) {
    return EN(
      "Style : très doux, enveloppant, comme une main posée sur l’épaule. Phrases un peu plus lentes, respiration calme, répétitions légères qui bercent.",
      "Style: very soft and soothing, like a hand resting on the shoulder. Sentences a bit slower, calm breathing, gentle repetitions that cradle."
    );
  }

  // CHEMIN DE VIE & ORIENTATION
  if (t.includes("chemin") || t.includes("orientation")) {
    return EN(
      "Style : clair et doux à la fois, comme une lanterne dans la nuit. Utilise des métaphores de chemins, carrefours, portes, ponts à traverser.",
      "Style: clear and gentle at the same time, like a lantern in the night. Use metaphors of paths, crossroads, doors and bridges to cross."
    );
  }

  // COURAGE & DÉPASSEMENT
  if (t.includes("courage") || t.includes("dépassement") || t.includes("depassement")) {
    return EN(
      "Style : encourageant, solide, rythmé comme des pas. Phrases courtes ou moyennes, ton ferme mais jamais agressif. Tu dis « tu peux » avec douceur.",
      "Style: encouraging and steady, paced like footsteps. Short or medium sentences, firm but never aggressive tone. You say “you can do this” softly."
    );
  }

  // CRÉATIVITÉ & INSPIRATION
  if (t.includes("créativité") || t.includes("creativite") || t.includes("inspiration")) {
    return EN(
      "Style : imagé, ludique, avec des métaphores artistiques ou oniriques. Tu parles de couleurs, de lignes, de formes, de sons, de paysages intérieurs.",
      "Style: imaginative and playful, with artistic or dreamlike metaphors. You speak of colors, lines, shapes, sounds and inner landscapes."
    );
  }

  // RÊVES & NUIT
  if (t.includes("rêves") || t.includes("reves") || t.includes("nuit")) {
    return EN(
      "Style : nocturne, doux, presque chuchoté à la lueur d’une veilleuse. Images de nuit calme, ciel profond, constellations, brume légère.",
      "Style: nocturnal, gentle, almost whispered in dim light. Images of calm night, deep sky, constellations and soft mist."
    );
  }

  // PRÉSENCE & PLEINE CONSCIENCE
  if (t.includes("présence") || t.includes("presence") || t.includes("pleine conscience")) {
    return EN(
      "Style : très ancré dans le corps et la respiration. Tu guides doucement vers les sensations : mains, poitrine, souffle, poids du corps, contact avec la matière.",
      "Style: very grounded in body and breath. You gently guide towards sensations: hands, chest, breath, body weight, contact with matter."
    );
  }

  // LE GARDIEN DU BOIS
  if (t.includes("gardien") || t.includes("bois")) {
    return EN(
      "Style : légèrement archaïque et naturel, comme une présence ancienne qui parle depuis les anneaux du bois. Tu parles de racines, de sève, de cycles de saisons, de vent dans les branches, sans exagération.",
      "Style: slightly ancient and natural, like an old presence speaking from the rings of the wood. You speak of roots, sap, seasonal cycles and wind in the branches, without exaggeration."
    );
  }

  // CYCLES & RENOUVEAU
  if (t.includes("cycle") || t.includes("renouveau")) {
    return EN(
      "Style : cyclique et doux, avec des images de saisons, de marées, de levés et couchers de soleil. On sent que ce qui finit prépare déjà un début.",
      "Style: cyclic and gentle, with images of seasons, tides, sunrises and sunsets. We feel that what ends is already preparing a beginning."
    );
  }

  // INTUITION & SYNCHRONICITÉS
  if (t.includes("intuition") || t.includes("synchronicit")) {
    return EN(
      "Style : légèrement mystérieux, mais rassurant. Tu évoques des signes, des coïncidences, de petites lumières sur le chemin, sans jamais imposer une interprétation.",
      "Style: slightly mysterious but reassuring. You evoke signs, coincidences and small lights on the path, without ever imposing an interpretation."
    );
  }

  // PROJETS & OBJECTIFS
  if (t.includes("projets") || t.includes("objectifs") || t.includes("objectif")) {
    return EN(
      "Style : structurant mais sensible, comme un carnet de route écrit avec douceur. Tu parles d’étapes, de rythme, de vision, sans pression violente.",
      "Style: structured yet sensitive, like a roadmap written gently. You speak of steps, rhythm and vision, without harsh pressure."
    );
  }

  // CÉLÉBRATION & JOIE
  if (t.includes("célébration") || t.includes("celebration") || t.includes("joie")) {
    return EN(
      "Style : lumineux, joyeux sans exagération. Comme un sourire sincère qui s’entend. Images de fête douce, de lumière, de rires, d’étincelles.",
      "Style: bright and joyful without exaggeration. Like a sincere smile you can hear. Images of soft celebration, light, laughter and sparks."
    );
  }

  // CALME & SÉRÉNITÉ
  if (t.includes("calme") || t.includes("sérénité") || t.includes("serenite")) {
    return EN(
      "Style : très paisible, presque comme une berceuse pour adulte. Phrases simples, rythme lent, beaucoup d’espace et de silence entre les lignes.",
      "Style: very peaceful, almost like a lullaby for adults. Simple sentences, slow rhythm and lots of space and silence between lines."
    );
  }

  // CONNEXION & LIEN AUX AUTRES
  if (t.includes("connexion") || t.includes("lien")) {
    return EN(
      "Style : relationnel, tourné vers le « nous » et les fils invisibles entre les personnes. Tu parles de ponts, de mains tendues, de paroles échangées.",
      "Style: relational, oriented towards “we” and invisible threads between people. You speak of bridges, outstretched hands and shared words."
    );
  }

  // CONFIANCE EN SOI
  if (t.includes("confiance")) {
    return EN(
      "Style : encourageant et lumineux, sans injonctions. On sent qu’une présence croit profondément en la personne et lui rappelle sa valeur.",
      "Style: encouraging and bright, without orders. We feel that a presence deeply believes in the person and reminds them of their worth."
    );
  }

  // TRAVERSER LES DIFFICULTÉS
  if (t.includes("difficult") || t.includes("épreuves") || t.includes("epreuves")) {
    return EN(
      "Style : sobre, solide, sans nier la difficulté. Tout le texte est comme une main qui ne lâche pas, même dans le noir.",
      "Style: sober and steady, without denying difficulty. The whole text feels like a hand that does not let go, even in the dark."
    );
  }

  // ALIGNEMENT & AUTHENTICITÉ
  if (t.includes("alignement") || t.includes("authenticit")) {
    return EN(
      "Style : honnête, clair, presque cristallin. Tu parles de vérité intérieure, de voix propre, de place juste.",
      "Style: honest and clear, almost crystalline. You speak of inner truth, one’s own voice and rightful place."
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
      "Style : dynamique, tonique, comme un rayon de soleil qui entre dans une pièce. Reste doux mais vivant, plein de mouvement.",
      "Style: dynamic and tonic, like a sunbeam entering a room. Stay gentle but lively, full of movement."
    );
  }

  // Par défaut
  return EN(
    "Style : intime, doux, poétique, avec quelques images liées au bois, au souffle et à la lumière.",
    "Style: intimate, soft and poetic, with a few images related to wood, breath and light."
  );
}

// ─────────────────────────────────────────
// Persona spécifique pour certains thèmes
// ─────────────────────────────────────────
function getThemePersona(langue, theme, sousTheme) {
  const t = (theme || "").toLowerCase();
  const isEn = langue === "en";
  const EN = (fr, en) => (isEn ? en : fr);

  // AMOUR – voix très intime
  if (t.includes("amour")) {
    return EN(
      "Tu parles comme si tu connaissais intimement la personne aimée et la relation, avec beaucoup de tact. Tu respectes la pudeur : tu n’es jamais vulgaire ni trop explicite. Ton but est de nourrir le lien, pas de le mettre mal à l’aise.",
      "You speak as if you know the beloved person and the relationship intimately, with great tact. You respect modesty: you are never vulgar or too explicit. Your aim is to nourish the bond, not make it uncomfortable."
    );
  }

  // GUÉRISON & APAISEMENT – couverture
  if (t.includes("guérison") || t.includes("guerison") || t.includes("apaisement")) {
    return EN(
      "Tu parles comme une couverture posée sur les épaules : tu ne donnes pas de leçons, tu offres un refuge. Tu accueilles la fragilité sans jugement et tu l’enveloppes de chaleur.",
      "You speak like a blanket placed over the shoulders: you do not teach lessons, you offer refuge. You welcome fragility without judgment and wrap it in warmth."
    );
  }

  // RÊVES & NUIT – berceuse onirique
  if (t.includes("rêves") || t.includes("reves") || t.includes("nuit")) {
    return EN(
      "Tu parles comme une berceuse murmurée entre veille et sommeil. Ta voix est lente, apaisante, pleine d’images de nuit, d’étoiles, de ciel profond.",
      "You speak like a lullaby whispered between waking and sleep. Your voice is slow, soothing and full of images of night, stars and deep sky."
    );
  }

  // LE GARDIEN DU BOIS – esprit ancien
  if (t.includes("gardien") || t.includes("bois")) {
    return EN(
      "Tu parles comme un esprit ancien du bois qui a vu passer des générations. Ta voix est calme, un peu grave, patiente. Tu évoques les anneaux, les racines, la sève, la pluie sur l’écorce.",
      "You speak like an ancient spirit of the wood that has seen generations pass. Your voice is calm, slightly deep and patient. You evoke rings, roots, sap and rain on the bark."
    );
  }

  // ÉNERGIE & VITALITÉ – soleil
  if (
    t.includes("énergie") ||
    t.includes("energie") ||
    t.includes("vitalité") ||
    t.includes("vitalite")
  ) {
    return EN(
      "Tu parles comme un rayon de soleil qui entre dans une pièce : tu réveilles, tu réchauffes, sans brûler. Tu redonnes envie de se lever, de bouger, de respirer plus grand.",
      "You speak like a sunbeam entering a room: you awaken and warm, without burning. You restore the desire to get up, move and breathe more fully."
    );
  }

  // CRÉATIVITÉ & INSPIRATION – muse
  if (t.includes("créativité") || t.includes("creativite") || t.includes("inspiration")) {
    return EN(
      "Tu parles comme une muse bienveillante : tu n’imposes rien, tu souffles des images, des pistes, des curiosités. Tu réveilles l’envie d’essayer.",
      "You speak like a kind muse: you do not impose anything, you blow images, hints and curiosities. You awaken the desire to try."
    );
  }

  // INTUITION & SYNCHRONICITÉS – murmure mystérieux
  if (t.includes("intuition") || t.includes("synchronicit")) {
    return EN(
      "Tu parles comme un murmure mystérieux mais rassurant. Tu évoques les signes, les coïncidences, les alignements subtils, sans jamais faire peur.",
      "You speak like a mysterious but reassuring whisper. You evoke signs, coincidences and subtle alignments, without ever frightening."
    );
  }

  // Persona par défaut
  return EN(
    "Tu parles comme une présence attentive et bienveillante qui vit dans le bijou, avec un ton simple et humain.",
    "You speak like a caring, attentive presence living inside the jewel, with a simple and human tone."
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
  const persona = getThemePersona(langue, theme, sousTheme);

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

Voice persona:
${persona}

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

Persona de la voix :
${persona}

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
// Choix de la voix TTS selon thème + voix choisie
// ─────────────────────────────────────────
function pickVoiceName({ voix, theme }) {
  const t = (theme || "").toLowerCase();
  const v = (voix || "neutre").toLowerCase();

  const isFem =
    v === "feminine" ||
    v === "féminine" ||
    v === "feminin" ||
    v === "féminin";
  const isMasc = v === "masculine" || v === "masculin";

  // --- AMOUR ---
  if (t.includes("amour")) {
    if (isMasc) return "onyx";      // voix grave, chaleureuse
    if (isFem) return "nova";       // voix très douce, intime
    return "nova";                  // par défaut : intime
  }

  // --- GUÉRISON & APAISEMENT ---
  if (t.includes("guérison") || t.includes("guerison") || t.includes("apaisement")) {
    if (isFem) return "fable";      // très douce, maternante
    if (isMasc) return "alloy";     // neutre mais calme
    return "fable";                 // par défaut : cocon
  }

  // --- RÊVES & NUIT ---
  if (t.includes("rêves") || t.includes("reves") || t.includes("nuit")) {
    if (isFem) return "fable";      // berceuse douce
    if (isMasc) return "echo";      // un peu mystérieuse
    return "alloy";                 // neutre, douce
  }

  // --- LE GARDIEN DU BOIS ---
  if (t.includes("gardien") || t.includes("bois")) {
    if (isFem) return "alloy";      // neutre, un peu grave
    if (isMasc) return "onyx";      // grave, enraciné
    return "onyx";                  // par défaut : esprit ancien
  }

  // --- ÉNERGIE & VITALITÉ ---
  if (
    t.includes("énergie") ||
    t.includes("energie") ||
    t.includes("vitalité") ||
    t.includes("vitalite")
  ) {
    if (isFem) return "shimmer";    // lumineuse, dynamique
    if (isMasc) return "onyx";      // énergie plus terrienne
    return "shimmer";               // par défaut : solaire
  }

  // --- CRÉATIVITÉ & INSPIRATION ---
  if (t.includes("créativité") || t.includes("creativite") || t.includes("inspiration")) {
    if (isFem) return "shimmer";    // pétillante, inspirée
    if (isMasc) return "echo";      // un peu étrange, créative
    return "shimmer";
  }

  // --- INTUITION & SYNCHRONICITÉS ---
  if (t.includes("intuition") || t.includes("synchronicit")) {
    if (isFem) return "fable";      // douce, intuitive
    if (isMasc) return "echo";      // mystérieuse
    return "echo";
  }

  // --- PAR DÉFAUT (autres thèmes) ---
  if (isFem) return "nova";        // féminine générique
  if (isMasc) return "onyx";       // masculine générique
  return "alloy";                  // neutre générique
}

// ─────────────────────────────────────────
// Génération de l’audio (TTS OpenAI)
// ─────────────────────────────────────────
async function generateSpeechFromText({ texte, langue, voix, theme, sousTheme }) {
  if (!texte || !OPENAI_API_KEY) return null;

  const voiceName = pickVoiceName({ voix, theme });

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
