// lang-switch.js
(function () {
  // Détecte la langue UI (URL ?lang=..., sinon navigateur, FR par défaut)
  function detectUiLang() {
    try {
      const url = new URL(window.location.href);
      const paramLang = (url.searchParams.get("lang") || "").toLowerCase();
      if (paramLang === "fr" || paramLang === "en") return paramLang;
    } catch (e) {}

    const navLang = (navigator.language || navigator.userLanguage || "fr").toLowerCase();
    if (navLang.startsWith("en")) return "en";
    return "fr";
  }

  function setLangAndReload(lang) {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", lang);
    window.location.href = url.toString();
  }

  // Applique la langue courante aux liens internes (pour garder ?lang=… partout)
  function propagateLangToLinks(currentLang) {
    const origin = window.location.origin;
    document.querySelectorAll('a[href^="/"]').forEach((a) => {
      try {
        const link = new URL(a.getAttribute("href"), origin);
        // Ne pas écraser si le lien force déjà une langue
        const existingLang = (link.searchParams.get("lang") || "").toLowerCase();
        if (existingLang !== "fr" && existingLang !== "en") {
          link.searchParams.set("lang", currentLang);
          a.setAttribute("href", link.pathname + link.search + link.hash);
        }
      } catch (e) {
        // on ignore les erreurs
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const currentLang = detectUiLang();

    // Met à jour l’attribut lang de la page
    document.documentElement.lang = currentLang;

    // Active le bon bouton si présent
    const btnFr = document.querySelector(".lang-switch .lang-btn[data-lang='fr']");
    const btnEn = document.querySelector(".lang-switch .lang-btn[data-lang='en']");

    if (btnFr && btnEn) {
      if (currentLang === "en") {
        btnEn.classList.add("active");
        btnFr.classList.remove("active");
      } else {
        btnFr.classList.add("active");
        btnEn.classList.remove("active");
      }

      btnFr.addEventListener("click", () => setLangAndReload("fr"));
      btnEn.addEventListener("click", () => setLangAndReload("en"));
    }

    // Propage la langue dans les liens
    propagateLangToLinks(currentLang);
  });
})();
