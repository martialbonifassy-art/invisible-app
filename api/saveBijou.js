import { supabase } from "../supabase.js";

// Lecture du corps JSON (Vercel ne le fait pas tout seul)
async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        const json = JSON.parse(data);
        resolve(json);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  // Petit GET pour tester la route
  if (req.method === "GET") {
    res.status(200).json({ ok: true, message: "Route /api/saveBijou OK" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    console.error("Erreur JSON:", e);
    res.status(400).json({ error: "Corps JSON invalide" });
    return;
  }

  const { id, prenom, intention, detail, voix } = body || {};

  if (!id) {
    res.status(400).json({ error: "ID manquant" });
    return;
  }

  try {
    // Vérifier si le bijou existe déjà
    const { data: existing } = await supabase
      .from("bijous")
      .select("id")
      .eq("id", id)
      .single();

    if (existing) {
      // Mise à jour
      const { error } = await supabase
        .from("bijous")
        .update({
          prenom,
          intention,
          detail,
          voix,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        console.error("Erreur mise à jour Supabase:", error);
        res.status(500).json({ error: "Erreur mise à jour" });
        return;
      }

      res.status(200).json({ ok: true, action: "update" });
      return;
    }

    // Création
    const { error } = await supabase.from("bijous").insert([
      {
        id,
        prenom,
        intention,
        detail,
        voix,
        messages_max: 100,
        messages_restants: 100,
      },
    ]);

    if (error) {
      console.error("Erreur insertion Supabase:", error);
      res.status(500).json({ error: "Erreur insertion" });
      return;
    }

    res.status(200).json({ ok: true, action: "insert" });
  } catch (e) {
    console.error("Erreur serveur saveBijou:", e);
    res.status(500).json({ error: "Erreur serveur" });
  }
}
