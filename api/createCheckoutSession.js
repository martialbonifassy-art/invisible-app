// api/createCheckoutSession.js

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const { idBijou, prenom } = req.body || {};

    if (!idBijou) {
      return res.status(400).json({ error: "idBijou manquant." });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "STRIPE_SECRET_KEY non configurée." });
    }

    // 🔢 À ADAPTER : prix en centimes (ex: 12000 = 120,00 €)
    const unitAmount = 12000;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Ligne de produit simple – tu peux aussi utiliser un price_id
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Bijou relié à l’Atelier des Liens Invisibles",
              description: prenom
                ? `Murmure personnalisé pour ${prenom}`
                : "Murmure personnalisé",
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      // 🔗 URL après paiement réussi
      success_url: `https://invisible-app-atelier.vercel.app/success.html?id=${encodeURIComponent(
        idBijou
      )}`,
      // 🔗 URL si la personne annule
      cancel_url: `https://invisible-app-atelier.vercel.app/personnalisation.html?id=${encodeURIComponent(
        idBijou
      )}`,
      metadata: {
        bijou_id: idBijou,
        prenom: prenom || "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("Erreur Stripe:", e);
    return res.status(500).json({ error: "Erreur lors de la création du paiement." });
  }
}
