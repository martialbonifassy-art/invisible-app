// lang-switch.js
// Switch global FR / EN basé sur le nom du fichier :
// - page.html  <-> page-en.html

document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".lang-btn");
  if (!buttons.length) return;

  const loc = window.location;
  const path = loc.pathname;

  // Exemple : /index.html, /index-en.html, /client.html…
  const isEnglish = path.includes("-en.");

  // Met à jour l'état visuel des boutons
  buttons.forEach((btn) => {
    const lang = btn.dataset.lang; // "fr" ou "en"

    if ((lang === "en" && isEnglish) || (lang === "fr" && !isEnglish)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }

    btn.addEventListener("click", () => {
      if (lang === "fr" && isEnglish) {
        // ex : /index-en.html -> /index.html
        const newPath = path.replace("-en.", ".");
        loc.href = newPath + loc.search;
      } else if (lang === "en" && !isEnglish) {
        // ex : /index.html -> /index-en.html
        const newPath = path.replace(/(\.html?)$/, "-en$1");
        loc.href = newPath + loc.search;
      }
      // Si on clique sur la langue déjà active : ne rien faire
    });
  });
});
