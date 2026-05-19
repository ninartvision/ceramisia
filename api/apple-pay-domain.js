/**
 * Apple Pay domain verification for Flitt embedded wallet buttons.
 * Set FLITT_APPLE_PAY_DOMAIN_ASSOCIATION in Vercel (full file body from Flitt support).
 * Served at /.well-known/apple-developer-merchantid-domain-association via vercel.json rewrite.
 */

function normalizeEnvValue(v) {
  if (v == null) return "";
  return String(v)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).send("Method Not Allowed");
  }

  const content = normalizeEnvValue(
    process.env.FLITT_APPLE_PAY_DOMAIN_ASSOCIATION
  );

  if (!content) {
    console.warn(
      "[apple-pay-domain] FLITT_APPLE_PAY_DOMAIN_ASSOCIATION not set — request file from Flitt support"
    );
    return res.status(404).send("Apple Pay domain association not configured");
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  if (req.method === "HEAD") {
    return res.status(200).end();
  }
  return res.status(200).send(content);
}
