// lang-switch.js
// Switch FR/EN simple et global pour les pages statiques

(function () {
  const buttons = document.querySelectorAll(".lang-btn");
  if (!buttons.length) return;

  const path = window.location.pathname || "/";

  // Normalisation de l'URL d'accueil (" / " ou "/index.html ")
  const normalized =
    path === "/" ? "/index.html" : path;
    // Paramétrage client (première activation)
    "/client-setup.html": {
      fr: "/client-setup.html",
      en: "/client-setup-en.html",
    },
    "/client-setup-en.html": {
      fr: "/client-setup.html",
      en: "/client-setup-en.html",
    },

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

    // Client
    "/client.html": {
      fr: "/client.html",
      en: "/client-en.html",
    },
    "/client-en.html": {
      fr: "/client.html",
      en: "/client-en.html",
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

    // Page murmure
    "/bijou.html": {
      fr: "/bijou.html",
      en: "/bijou-en.html",
    },
    "/bijou-en.html": {
      fr: "/bijou.html",
      en: "/bijou-en.html",
    },

    // Dashboard (si tu fais une version EN plus tard)
    "/dashboard.html": {
      fr: "/dashboard.html",
      en: "/dashboard-en.html",
    },
    "/dashboard-en.html": {
      fr: "/dashboard.html",
      en: "/dashboard-en.html",
    },
  };

  const current = MAP[normalized];
  if (!current) return;

  // Met le bon bouton en "actif"
  buttons.forEach((btn) => {
    const lang = btn.dataset.lang;
    if (!lang) return;

    const targetUrl = current[lang];

    // Active le bouton correspondant à la page courante
    if (targetUrl === normalized) {
      btn.classList.add("active");
    }

    btn.addEventListener("click", () => {
      if (!targetUrl || targetUrl === normalized) return;
      window.location.href = targetUrl;
    });
  });
})();
