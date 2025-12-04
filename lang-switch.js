// lang-switch.js
// Switch FR/EN simple et global pour les pages statiques / semi-statiques.
// - Repère les boutons .lang-btn
// - Utilise data-lang="fr"/"en" ou, à défaut, le texte du bouton ("FR"/"EN")
// - Bascule entre les versions FR/EN d'une même page
// - Conserve les paramètres d'URL (?code=..., ?public_id=..., ?id=...).

(function () {
  const buttons = document.querySelectorAll(".lang-btn");
  if (!buttons.length) return;

  const loc = window.location;
  const path = loc.pathname || "/";

  // Normalisation de l'URL d'accueil (" / " ou "/index.html ")
  const normalized = path === "/" ? "/index.html" : path;

  // Cartographie des pages FR/EN
  const MAP = {
    // Accueil
    "/index.html": {
      fr: "/index.html",
      en: "/index-en.html",
    },
    "/index-en.html": {
      fr: "/index.html",
      en: "/index-en.html",
    },

    // Page client (consultation / recharge)
    "/client.html": {
      fr: "/client.html",
      en: "/client-en.html",
    },
    "/client-en.html": {
      fr: "/client.html",
      en: "/client-en.html",
    },

    // Page de paramétrage client (première config / reconfig)
    "/client-setup.html": {
      fr: "/client-setup.html",
      en: "/client-setup-en.html",
    },
    "/client-setup-en.html": {
      fr: "/client-setup.html",
      en: "/client-setup-en.html",
    },

    // Personnalisation artisan
    "/personnalisation.html": {
      fr: "/personnalisation.html",
      en: "/personnalisation-en.html",
    },
    "/personnalisation-en.html": {
      fr: "/personnalisation.html",
      en: "/personnalisation-en.html",
    },

    // Page de murmure interne (bijou)
    "/bijou.html": {
      fr: "/bijou.html",
      en: "/bijou-en.html",
    },
    "/bijou-en.html": {
      fr: "/bijou.html",
      en: "/bijou-en.html",
    },

    // Dashboard atelier
    "/dashboard.html": {
      fr: "/dashboard.html",
      en: "/dashboard-en.html",
    },
    "/dashboard-en.html": {
      fr: "/dashboard.html",
      en: "/dashboard-en.html",
    },

    // Page b.html (entrée NFC) : même fichier pour FR/EN
    "/b.html": {
      fr: "/b.html",
      en: "/b.html",
    },
  };

  const current = MAP[normalized];
  if (!current) return;

  const search = loc.search || "";

  buttons.forEach((btn) => {
    // 1) Déterminer la langue du bouton
    let lang = btn.dataset.lang;
    if (!lang) {
      const txt = (btn.textContent || "").trim().toLowerCase();
      if (txt === "fr") lang = "fr";
      if (txt === "en") lang = "en";
    }
    if (!lang || !current[lang]) return;

    const targetPath = current[lang];

    // 2) Met le bon bouton en "actif"
    if (targetPath === normalized) {
      btn.classList.add("active");
    }

    // 3) Gestion du clic
    btn.addEventListener("click", (e) => {
      // On prend la main pour conserver le ?code, ?public_id, etc.
      e.preventDefault();

      // Si on est déjà sur la bonne version, ne rien faire
      if (targetPath === normalized) return;

      const url = targetPath + search;
      window.location.href = url;
    });
  });
})();
