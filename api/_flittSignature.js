import crypto from "crypto";

/**
 * Build ordered signature segments per Flitt docs (alphabetical keys, pipe-joined values).
 * Matches https://docs.flitt.com/api/building-signature/ Python reference:
 * - Include key iff value is not '', not None — we also skip undefined (JS analogue).
 * - Exclude `signature` and `response_signature_string`.
 * - Values are cast like Python `str(value)` for the plaintext pipe segments.
 *
 * The official node-js-sdk excludes only '' but includes null/undefined, producing stray
 * "|" segments; Flitt's documented behaviour omits empty/absent parameters entirely.
 *
 * @see https://docs.flitt.com/api/building-signature/
 * @see https://github.com/flittpayments/node-js-sdk/blob/main/lib/util.js
 */

function shouldSkipSigningEntry(key, value) {
  if (key === "signature" || key === "response_signature_string") return true;
  if (value === null || value === undefined) return true;
  if (value === "") return true;
  return false;
}

/** Scalar → segment string (Python str(...) style for API primitives). */
export function flittValueToSignSegment(value) {
  if (typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("signFlittPayload: non-finite number not allowed");
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function collectSignEntries(params) {
  const entries = [];
  Object.keys(params)
    .sort()
    .forEach(function flittCollect(key) {
      const val = params[key];
      if (shouldSkipSigningEntry(key, val)) return;
      entries.push({
        key,
        segment: flittValueToSignSegment(val),
      });
    });
  return entries;
}

export function signFlittPayload(secret, params) {
  if (params == null || typeof params !== "object") {
    throw new TypeError("signFlittPayload: params must be an object");
  }
  const entries = collectSignEntries(params);
  const signString =
    String(secret) + "|" + entries.map((e) => e.segment).join("|");
  return crypto.createHash("sha1").update(signString, "utf8").digest("hex");
}

/**
 * Debug helper: same filtering/order as signing, without hashing. Never log `secret`.
 */
export function describeFlittSignInputs(params) {
  if (params == null || typeof params !== "object") {
    return {
      sorted_keys: [],
      values_joined_after_secret: "",
      types: {},
    };
  }
  const entries = collectSignEntries(params);
  const sortedKeys = entries.map((e) => e.key);
  const types = sortedKeys.reduce((acc, k, i) => {
    const v = params[k];
    acc[k] = Array.isArray(v) ? "array" : typeof v;
    return acc;
  }, {});
  return {
    sorted_keys: sortedKeys,
    values_joined_after_secret: entries.map((e) => e.segment).join("|"),
    types,
  };
}

/**
 * Structured audit for logs (no secrets): UTF-8 byte length of full SHA1 input string,
 * segment count, redacted base string (secret replaced by placeholder).
 */
export function auditFlittSignaturePlaintext(secret, params) {
  const entries = collectSignEntries(params);
  const dataSegment = entries.map((e) => e.segment).join("|");
  const signString = String(secret) + "|" + dataSegment;
  return {
    secret_length: String(secret).length,
    sorted_keys: entries.map((e) => e.key),
    segment_count: entries.length,
    values_joined_after_secret: dataSegment,
    /** UTF-8 byte length of secret|values (same bytes fed to SHA1) */
    sign_string_utf8_bytes: Buffer.byteLength(signString, "utf8"),
    /** Safe for logs — compare data tail to Flitt response_signature_string after masked secret */
    redacted_sign_string: `***SECRET(len=${String(secret).length})***|${dataSegment}`,
  };
}

export function verifyFlittPayload(secret, raw) {
  if (!raw || typeof raw !== "object") return false;
  const sig = raw.signature;
  if (!sig || typeof sig !== "string") return false;
  const computed = signFlittPayload(secret, raw);
  return computed === String(sig).toLowerCase();
}
