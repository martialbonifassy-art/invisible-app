// /api/utils/verifySignature.js
//
// Vérifie une signature HMAC-SHA256 basée sur la private_key stockée en base
// La signature est en hex (ex: "4af8d12e…")

import crypto from "crypto";

/**
 * Vérifie la signature HMAC pour un bijou donné.
 *
 * @param {string} publicId - L'ID public du bijou (ex: "95QN27")
 * @param {string} providedSig - La signature transmise via l'URL (hex)
 * @param {string} privateKey - La clé privée du bijou (hex, 64 caractères)
 * @returns {boolean} - true si la signature est valide
 */
export function verifySignature(publicId, providedSig, privateKey) {
  try {
    if (!publicId || !providedSig || !privateKey) return false;

    const hmac = crypto
      .createHmac("sha256", Buffer.from(privateKey, "hex"))
      .update(publicId)
      .digest("hex");

    // comparaison en timing-safe pour éviter les attaques
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(providedSig, "hex")
    );
  } catch (e) {
    console.error("Erreur verifySignature:", e);
    return false;
  }
}
