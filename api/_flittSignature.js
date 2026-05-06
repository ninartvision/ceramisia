import crypto from "crypto";

/**
 * Flitt request/callback signature: SHA1( secret + "|" + sorted values only ).
 * @see https://docs.flitt.com/api/building-signature/
 */
export function signFlittPayload(secret, params) {
  const filtered = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === "signature" || k === "response_signature_string") continue;
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v === "") continue;
    filtered[k] = v;
  }
  const keys = Object.keys(filtered).sort();
  const parts = [String(secret)];
  for (const k of keys) {
    parts.push(String(filtered[k]));
  }
  const line = parts.join("|");
  return crypto.createHash("sha1").update(line, "utf8").digest("hex");
}

export function verifyFlittPayload(secret, raw) {
  if (!raw || typeof raw !== "object") return false;
  const sig = raw.signature;
  if (!sig || typeof sig !== "string") return false;
  const computed = signFlittPayload(secret, raw);
  return computed === String(sig).toLowerCase();
}
