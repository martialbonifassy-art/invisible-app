import { supabase } from "../../utils/supabaseClient";

export default async function handler(req, res) {
  try {
    const { public_id } = req.query;
    if (!public_id) {
      return res.status(400).json({ error: "public_id requis" });
    }

    // Récupérer le bijou
    const { data: rows, error } = await supabase
      .from("bijoux")
      .select("*")
      .eq("public_id", public_id)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return res.status(404).json({ error: "Bijou introuvable" });
    }

    const bijou = rows[0];

    // Vérifier si configuré
    if (bijou.etat !== "configuré") {
      return res.json({
        ok: true,
        id: bijou.id,
        public_id,
        text:
          bijou.langue === "en"
            ? "This jewel has been created, but its whisper has not yet been written. Please configure it."
            : "Ce bijou existe, mais son murmure n’a pas encore été écrit. Merci de le configurer.",
        audio: null,
      });
    }

    // IA active ou non — ici mode DEMO
    const textDemo =
      bijou.langue === "en"
        ? `A demo whisper for ${bijou.prenom}, based on the theme ${bijou.theme}.`
        : `Un murmure de démonstration pour ${bijou.prenom}, basé sur le thème ${bijou.theme}.`;

    const audioDemo = null; // audio désactivé pour le moment

    // 🔥 DÉCRÉMENTATION ICI
    await supabase
      .from("bijoux")
      .update({
        messages_restants: Math.max(0, bijou.messages_restants - 1),
        date_dernier_murmure: new Date().toISOString(),
      })
      .eq("public_id", public_id);

    // Retour API
    return res.json({
      ok: true,
      id: bijou.id,
      public_id,
      langue: bijou.langue,
      text: textDemo,
      audio: audioDemo,
    });
  } catch (err) {
    return res.status(500).json({ error: "Erreur interne", details: err });
  }
}
