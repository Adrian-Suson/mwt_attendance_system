const crypto = require("crypto");

let developmentSecret;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && (!secret || secret.length < 32)) {
    throw new Error(
      "JWT_SECRET must be set to at least 32 characters in production.",
    );
  }

  if (secret) return secret;
  developmentSecret ||= crypto.randomBytes(32).toString("hex");
  return developmentSecret;
}

module.exports = { getJwtSecret };
