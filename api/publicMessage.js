// api/publicMessage.js
import { createClient } from "@supabase/supabase-js";
import messageHandler from "./message";

// Client Supabase côté serveur (service role pour pouvoir décrémenter les compteurs)
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "[publicMessage] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans les variables d'environnement."
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { public_id } = req.query;

    if (!public_id) {
      return res.status(400).json({ error: "Missing public_id parameter" });
    }

    // 1) On retrouve le bijou via son public_id
    const { data: bijou, error } = await supabase
      .from("bijoux")
      .select("id")
      .eq("public_id", public_id)
      .maybeSingle();

    if (error) {
      console.error("[publicMessage] Supabase error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch jewel from database" });
    }

    if (!bijou) {
      return res.status(404).json({ error: "Unknown public_id" });
    }

    // 2) On adapte la query pour réutiliser le handler /api/message
    //    → on force l'id interne trouvé
    req.query = {
      ...req.query,
      id: bijou.id,
    };

    // Option : on pourrait aussi purger public_id si tu préfères
    // delete req.query.public_id;

    // 3) Déléguer à l'API existante /api/message
    //    (qui gère déjà langue, quota, locked, TTS, etc.)
    return messageHandler(req, res);
  } catch (e) {
    console.error("[publicMessage] Unexpected error:", e);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}
