// personnalisation.js

// ─────────────────────────────────────────────────────────────
// 1. Définition des thèmes, sous-thèmes et paramètres
// ─────────────────────────────────────────────────────────────

const THEMES = [
  {
    id: "amour",
    label: "❤️ 1. Amour",
    definition: "Messages qui nourrissent la tendresse, la connexion et la profondeur des liens.",
    subthemes: [
      "Pour ma femme",
      "Pour mon mari",
      "Pour ma fiancée",
      "Pour mon fiancé",
      "Pour un amour secret",
      "Pour un amour ancien",
      "Pour une relation naissante",
      "Pour un amour à distance",
      "Pour une occasion spéciale"
    ],
    parameters: [
      "Prénom de la personne",
      "Date d’un moment marquant",
      "Lieu d’un souvenir amoureux",
      "Souvenir clé ou anecdote",
      "Objet symbolique du couple",
      "Type d’intention : remercier / rapprocher / déclarer / réconforter"
    ]
  },
  {
    id: "gratitude",
    label: "🌿 2. Gratitude",
    definition: "Messages qui honorent la reconnaissance, les gestes invisibles et les présences qui nous soutiennent.",
    subthemes: [
      "Gratitude envers un proche",
      "Gratitude envers un parent",
      "Gratitude envers un ami",
      "Gratitude envers un mentor",
      "Gratitude envers un collègue",
      "Gratitude envers la vie / gratitude universelle"
    ],
    parameters: [
      "Personne concernée",
      "Quel geste précis remercier ?",
      "À quel moment ? (date / période)",
      "Quel impact cela a eu sur vous ?",
      "Une qualité de cette personne",
      "Type d’intention : remercier / reconnaître / honorer"
    ]
  },
  {
    id: "guerison",
    label: "🌊 3. Guérison & Apaisement",
    definition: "Messages qui offrent refuge et douceur dans les moments sensibles, fragiles ou chargés.",
    subthemes: [
      "Apaisement après un conflit",
      "Guérison émotionnelle",
      "Accompagnement d’un deuil",
      "Soutien dans le stress ou l’angoisse",
      "Après une séparation",
      "Reprendre confiance"
    ],
    parameters: [
      "Situation actuelle",
      "Émotion dominante",
      "Personne concernée (ou soi-même)",
      "Moment difficile déclencheur",
      "Besoin principal : douceur / force / soutien / clarté",
      "Un symbole de réconfort (objet, couleur, lieu calme)"
    ]
  },
  {
    id: "chemin_vie",
    label: "🌌 4. Chemin de vie & orientation",
    definition: "Messages qui éclairent les choix, les transitions et les carrefours intérieurs.",
    subthemes: [
      "Prendre une décision",
      "Changer de voie",
      "Trouver sa direction",
      "Doute existentiel",
      "Début d’un projet",
      "Recherche de clarté"
    ],
    parameters: [
      "Situation actuelle",
      "Décision à prendre",
      "Ce qui bloque",
      "Ce qui appelle",
      "Une date limite ou étape importante",
      "Type de guidance : douce / directe / symbolique"
    ]
  },
  {
    id: "courage",
    label: "🔥 5. Courage & dépassement",
    definition: "Messages qui activent la force intérieure, la détermination et l’élan vers l’action.",
    subthemes: [
      "Défi personnel",
      "Défi professionnel",
      "Surmonter une peur",
      "Se lancer dans l’inconnu",
      "Reprendre confiance",
      "Maintenir l’effort"
    ],
    parameters: [
      "Quel défi précisément ?",
      "Depuis quand ?",
      "Quel obstacle majeur ?",
      "Une réussite passée (preuve que tu peux y arriver)",
      "Sens du défi (pourquoi c’est important)",
      "Style d’énergie : motivante / rassurante / puissante / calme"
    ]
  },
  {
    id: "creativite",
    label: "🎨 6. Créativité & inspiration",
    definition: "Messages qui ouvrent l’imaginaire, débloquent les pensées et réveillent la muse intérieure.",
    subthemes: [
      "Blocage créatif",
      "Début d’un projet artistique",
      "Inspiration quotidienne",
      "Recherche d’idées nouvelles",
      "Fatigue créative",
      "Explorations imaginaires"
    ],
    parameters: [
      "Type de création (art, écriture, musique…)",
      "Obstacles ou doutes",
      "Une source d’inspiration personnelle",
      "Un souvenir créatif marquant",
      "État d’esprit souhaité : libre, joueur, profond, audacieux",
      "Une image clé (métaphore, symbole, couleur)"
    ]
  },
  {
    id: "reves",
    label: "🌙 7. Rêves & nuit",
    definition: "Messages qui accompagnent l’endormissement, invitent à la douceur ou nourrissent le monde onirique.",
    subthemes: [
      "Aide à l’endormissement",
      "Rituels du soir",
      "Accompagner les peurs nocturnes",
      "Rêves lucides",
      "Symbolique du rêve",
      "Préparer la nuit"
    ],
    parameters: [
      "Humeur du soir",
      "Besoin principal : calmer / inspirer / apaiser / détendre",
      "Image ou symbole de la nuit préféré",
      "Une phrase douce à inclure",
      "Lieu de sécurité imaginaire",
      "Rythme désiré : lent / enveloppant / mystique"
    ]
  },
  {
    id: "presence",
    label: "🌬️ 8. Présence & pleine conscience",
    definition: "Messages qui ramènent au souffle, à l’instant présent et à la qualité d’être.",
    subthemes: [
      "Anxiété",
      "Accélération mentale",
      "Ancrage corporel",
      "Moment de pause",
      "Retour au calme",
      "Respiration consciente"
    ],
    parameters: [
      "Moment de la journée concerné",
      "Sensation corporelle dominante",
      "Un lieu calme aimé",
      "Un geste ou rituel qui apaise",
      "Intention : ralentir / clarifier / ressentir",
      "Mot-clé sensoriel : toucher, souffle, lumière…"
    ]
  },
  {
    id: "gardien_bois",
    label: "🪵 9. Le gardien du bois",
    definition: "Une voix ancienne, bienveillante, issue de l’esprit du bois et porteuse d’histoires.",
    subthemes: [
      "Message protecteur",
      "Message ancestral",
      "Message de sagesse naturelle",
      "Message d’enracinement",
      "Message d’un “esprit du bois”",
      "Connexion à la nature"
    ],
    parameters: [
      "Essence du bois choisie (chêne, noyer, érable…)",
      "Sens symbolique recherché : protection / guidance / force",
      "Un souvenir lié à la nature",
      "Un lieu végétal important",
      "Une saison associée",
      "Style : ancestral, chamanique, poétique, minimaliste"
    ]
  },
  {
    id: "cycles",
    label: "🌅 10. Cycles & renouveau",
    definition: "Messages qui accompagnent les fins, les débuts et les transformations naturelles de la vie.",
    subthemes: [
      "Nouvelle étape",
      "Renouveau après une épreuve",
      "Fin d’un cycle",
      "Transition de vie",
      "Recommencer différemment",
      "Se libérer du passé"
    ],
    parameters: [
      "Cycle concerné (travail, relation, vie personnelle…)",
      "Élément à laisser derrière soi",
      "Nouveau désir / intention",
      "Une date symbolique (nouvelle lune, solstice, anniversaire…)",
      "Une métaphore de renouveau (saison, fleur, lumière…)",
      "Style d’énergie : douce / puissante / lumineuse / lente"
    ]
  },
  {
    id: "intuition",
    label: "🔮 11. Intuition & synchronicités",
    definition: "Messages qui renforcent la perception subtile, les signes et la petite voix intérieure.",
    subthemes: [
      "Se reconnecter à son intuition",
      "Comprendre un signe",
      "S’ouvrir aux synchronicités",
      "Décision “au feeling”",
      "Moments étranges ou significatifs",
      "Message symbolique"
    ],
    parameters: [
      "Dernier signe perçu",
      "Situation où l’intuition appelle",
      "Une image intérieure récurrente",
      "Un événement insolite récent",
      "Sensation dominante : chaleur, tension, vibration…",
      "Style de guidance : mystérieuse / précise / poétique"
    ]
  },
  {
    id: "projets",
    label: "🌄 12. Projets & objectifs",
    definition: "Messages qui soutiennent l’élan, la vision et la motivation dans les objectifs importants.",
    subthemes: [
      "Lancer un projet",
      "Clarifier un objectif",
      "Fixer une intention",
      "Tenir le rythme",
      "Dépasser un blocage",
      "Devenir régulier"
    ],
    parameters: [
      "Description du projet",
      "Niveau d’avancement",
      "Obstacles du moment",
      "Objectif final",
      "Deadline ou jalon important",
      "Style d’énergie : stratégique / motivante / structurante"
    ]
  },
  {
    id: "celebration",
    label: "🎉 13. Célébration & joie",
    definition: "Messages qui amplifient le plaisir, la satisfaction et l’éclat des bons moments.",
    subthemes: [
      "Anniversaire",
      "Réussite personnelle",
      "Réussite professionnelle",
      "Bonne nouvelle",
      "Victoire d’équipe",
      "Gratitude joyeuse"
    ],
    parameters: [
      "Événement à célébrer",
      "Personne concernée",
      "Date ou moment clé",
      "Sentiment dominant (fierté, joie, soulagement…)",
      "Un souvenir positif lié",
      "Ton souhait : amplifier / partager / honorer"
    ]
  },
  {
    id: "calme",
    label: "🧘‍♀️ 14. Calme & sérénité",
    definition: "Messages qui apaisent le mental, ralentissent le rythme et invitent au repos profond.",
    subthemes: [
      "Stress du quotidien",
      "Surcharge mentale",
      "Besoin de pause",
      "Moment pour respirer",
      "Retrouver le calme",
      "Après une longue journée"
    ],
    parameters: [
      "Source de tension",
      "Moment de la journée",
      "Sensation corporelle dominante",
      "Lieu associé au calme",
      "Besoin principal : relâcher / ralentir / reposer",
      "Image sensorielle : eau, vent, lumière douce…"
    ]
  },
  {
    id: "connexion",
    label: "🌐 15. Connexion & lien aux autres",
    definition: "Messages qui renforcent les relations, la communication et le sentiment d’appartenance.",
    subthemes: [
      "Mieux communiquer",
      "Retrouver un lien",
      "Entretenir une relation",
      "Améliorer une complicité",
      "Lien familial",
      "Lien amical"
    ],
    parameters: [
      "Relation concernée",
      "Dernier moment partagé",
      "Qualité que vous appréciez chez l’autre",
      "Une histoire commune",
      "Intention : rapprochement / compréhension / soutien",
      "Un symbole ou un lieu partagé"
    ]
  },
  {
    id: "confiance",
    label: "🌟 16. Confiance en soi",
    definition: "Messages qui renforcent la valeur personnelle et la capacité à agir avec assurance.",
    subthemes: [
      "Manque de confiance",
      "Comparaison aux autres",
      "Sentiment d’illégitimité",
      "Avant un événement important",
      "Reconstruire l’estime",
      "Prendre sa place"
    ],
    parameters: [
      "Situation où la confiance manque",
      "Un succès passé oublié",
      "Une qualité personnelle",
      "Un encouragement souhaité",
      "Une personne qui croit en vous",
      "Style : encourageant / ferme / lumineux"
    ]
  },
  {
    id: "difficultes",
    label: "🔁 17. Traverser les difficultés",
    definition: "Messages qui soutiennent dans les épreuves, les obstacles et les périodes d’incertitude.",
    subthemes: [
      "Soucis financiers",
      "Conflits relationnels",
      "Fatigue générale",
      "Dépression légère / baisse d’énergie",
      "Étape instable",
      "Sensation de perte de contrôle"
    ],
    parameters: [
      "Nature de la difficulté",
      "Depuis quand ?",
      "Personne de soutien autour",
      "Besoin principal : force / douceur / stabilité",
      "Une preuve de résilience passée",
      "Un symbole de résistance (montagne, feu, ancre…)"
    ]
  },
  {
    id: "alignement",
    label: "🧭 18. Alignement & authenticité",
    definition: "Messages qui encouragent à être soi-même, ajuster sa vie et suivre ses vraies valeurs.",
    subthemes: [
      "Se réaligner",
      "Vivre selon ses valeurs",
      "Quitter une situation fausse",
      "Retrouver sa vérité",
      "Dire non",
      "Se révéler"
    ],
    parameters: [
      "Valeurs importantes",
      "Situation qui n’est plus alignée",
      "Désir profond",
      "Une personne inspirante",
      "Intention : vérité / courage / clarté",
      "Image ou symbole d’authenticité"
    ]
  },
  {
    id: "racines",
    label: "🌾 19. Racines & origines",
    definition: "Messages qui honorent les racines, l’histoire personnelle et le sentiment d’appartenance.",
    subthemes: [
      "Famille",
      "Héritage",
      "Histoire personnelle",
      "Souvenir d’enfance",
      "Lien au pays / à la terre",
      "Transmission"
    ],
    parameters: [
      "Origines ou région importante",
      "Personne clé de l’enfance",
      "Souvenir fondateur",
      "Objet ou tradition familiale",
      "Émotion associée",
      "Style : nostalgique / doux / lumineux"
    ]
  },
  {
    id: "energie",
    label: "🔥 20. Énergie & vitalité",
    definition: "Messages qui stimulent l’élan intérieur, la joie de vivre et la dynamique personnelle.",
    subthemes: [
      "Fatigue physique",
      "Baisse d’énergie",
      "Manque d’enthousiasme",
      "Relancer la motivation",
      "Retrouver du tonus",
      "Besoin d’élan"
    ],
    parameters: [
      "Source de fatigue",
      "Moment critique (matin, soirée…)",
      "Un souvenir énergisant",
      "Une activité revitalisante",
      "Style : dynamisant / solaire / stimulant",
      "Symbole d’énergie : soleil, feu, cascade…"
    ]
  }
];

// ─────────────────────────────────────────────────────────────
// 2. Variables DOM
// ─────────────────────────────────────────────────────────────

let idInput,
  prenomInput,
  intentionInput,
  detailInput,
  voixSelect,
  btnTester,
  btnSave,
  etat,
  preview,
  urlExemple,
  themeSelect,
  subthemeSelect,
  definitionEl,
  paramsContainer,
  noteLibre,
  promptPreview;

// ─────────────────────────────────────────────────────────────
// 3. Initialisation globale
// ─────────────────────────────────────────────────────────────

function initPersonnalisation() {
  // Récupération des éléments du DOM
  idInput = document.getElementById("idBijou");
  prenomInput = document.getElementById("prenom");
  intentionInput = document.getElementById("intention"); // caché
  detailInput = document.getElementById("detail");       // caché
  voixSelect = document.getElementById("voix");
  btnTester = document.getElementById("btnTester");
  btnSave = document.getElementById("saveBtn");
  etat = document.getElementById("etat");
  preview = document.getElementById("preview");
  urlExemple = document.getElementById("urlExemple");

  themeSelect = document.getElementById("themeSelect");
  subthemeSelect = document.getElementById("subthemeSelect");
  definitionEl = document.getElementById("definition");
  paramsContainer = document.getElementById("parametersContainer");
  noteLibre = document.getElementById("noteLibre");
  promptPreview = document.getElementById("promptPreview");

  // URL NFC d’exemple
  idInput.addEventListener("input", majUrlExemple);
  majUrlExemple();

  // Initialisation des thèmes
  initThemes();

  // Boutons
  btnTester.addEventListener("click", onTesterMurmure);
  btnSave.addEventListener("click", onSaveBijou);
}

document.addEventListener("DOMContentLoaded", initPersonnalisation);

// ─────────────────────────────────────────────────────────────
// 4. URL NFC d’exemple
// ─────────────────────────────────────────────────────────────

function majUrlExemple() {
  const id = (idInput && idInput.value.trim()) || "BIJOU001";
  const url = `https://invisible-app-atelier.vercel.app/bijou.html?id=${encodeURIComponent(id)}`;
  if (urlExemple) {
    urlExemple.textContent = url;
  }
}

// ─────────────────────────────────────────────────────────────
// 5. Gestion des thèmes et du brief IA
// ─────────────────────────────────────────────────────────────

function getCurrentTheme() {
  return THEMES.find(t => t.id === themeSelect.value);
}

function initThemes() {
  // Remplir la liste des thèmes
  THEMES.forEach((theme, index) => {
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.label;
    if (index === 0) opt.selected = true;
    themeSelect.appendChild(opt);
  });

  themeSelect.addEventListener("change", renderTheme);
  subthemeSelect.addEventListener("change", updatePrompt);
  noteLibre.addEventListener("input", updatePrompt);
  prenomInput.addEventListener("input", updatePrompt);

  renderTheme();
}

function renderTheme() {
  const theme = getCurrentTheme();
  if (!theme) return;

  // Définition
  definitionEl.textContent = theme.definition;

  // Sous-thèmes
  subthemeSelect.innerHTML = "";
  theme.subthemes.forEach((st, i) => {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    if (i === 0) opt.selected = true;
    subthemeSelect.appendChild(opt);
  });

  // Paramètres -> champs texte
  paramsContainer.innerHTML = "";
  theme.parameters.forEach((paramLabel, index) => {
    const field = document.createElement("div");
    field.className = "field";

    const label = document.createElement("label");
    label.textContent = paramLabel;
    label.setAttribute("for", `param_${index}`);

    const input = document.createElement("input");
    input.type = "text";
    input.id = `param_${index}`;
    input.dataset.paramLabel = paramLabel;

    input.addEventListener("input", updatePrompt);

    field.appendChild(label);
    field.appendChild(input);
    paramsContainer.appendChild(field);
  });

  updatePrompt();
}

function updatePrompt() {
  const theme = getCurrentTheme();
  if (!theme) return;

  const subtheme = subthemeSelect.value;
  const paramInputs = paramsContainer.querySelectorAll("input");
  const note = noteLibre.value.trim();
  const prenom = prenomInput.value.trim();

  const details = [];
  paramInputs.forEach(input => {
    if (input.value.trim()) {
      details.push(`${input.dataset.paramLabel} : ${input.value.trim()}`);
    }
  });

  const promptParts = [];

  if (prenom) {
    promptParts.push(`Prénom de la personne : ${prenom}`);
  }

  promptParts.push(`Thème principal : ${theme.label}`);
  promptParts.push(`Sous-thème : ${subtheme}`);
  promptParts.push(`Intention générale : ${theme.definition}`);

  if (details.length) {
    promptParts.push("Détails personnels :");
    promptParts.push(details.map(d => `- ${d}`).join("\n"));
  }

  if (note) {
    promptParts.push("");
    promptParts.push("Note libre :");
    promptParts.push(note);
  }

  promptParts.push("");
  promptParts.push(
    "Consigne de ton : rédige un message poétique, sensible et sur mesure, comme un murmure intime issu d’un bijou en bois relié à une intelligence artificielle."
  );

  const prompt = promptParts.join("\n");

  // Affichage dans la zone de brief IA
  promptPreview.value = prompt;

  // Remplissage des champs techniques pour l’API actuelle
  intentionInput.value = prompt;
  detailInput.value = `Sous-thème choisi : ${subtheme}`;
}

// ─────────────────────────────────────────────────────────────
// 6. Test du murmure via /api/message
// ─────────────────────────────────────────────────────────────

async function onTesterMurmure() {
  const id = idInput.value.trim() || "BIJOU001";
  const prenom = prenomInput.value.trim();
  const intention = intentionInput.value.trim(); // généré
  const detail = detailInput.value.trim();       // généré
  const voix = voixSelect.value;

  etat.textContent = "L’IA compose le murmure…";
  btnTester.disabled = true;
  preview.textContent = "";

  const params = new URLSearchParams({
    id,
    prenom,
    intention,
    detail,
    voix
  });

  try {
    const r = await fetch(`/api/message?${params.toString()}`);
    const data = await r.json();
    preview.textContent = data.text || "Je suis là, silencieux, mais présent pour toi.";
    etat.textContent = "Murmure généré (prévisualisation).";
  } catch (e) {
    preview.textContent = "Erreur : impossible de joindre la voix du bijou.";
    etat.textContent = "Erreur de connexion à l’IA.";
  } finally {
    btnTester.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────
// 7. Enregistrement du bijou via /api/saveBijou
// ─────────────────────────────────────────────────────────────

async function onSaveBijou() {
  const body = {
    id: idInput.value.trim(),
    prenom: prenomInput.value.trim(),
    intention: intentionInput.value.trim(),
    detail: detailInput.value.trim(),
    voix: voixSelect.value.trim()
  };

  if (!body.id) {
    alert("Veuillez entrer un ID de bijou.");
    return;
  }

  const r = await fetch("/api/saveBijou", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const result = await r.json();

  if (result.ok) {
    alert("Bijou enregistré avec succès !");
  } else {
    alert("Erreur : " + result.error);
  }
}
