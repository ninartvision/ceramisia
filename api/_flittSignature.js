import crypto from "crypto";

/**
 * Byte-for-byte same rules as flittpayments/node-js-sdk `genSignature` (`lib/util.js`):
 * - Sort keys with default `Array.prototype.sort` (lexicographic by UTF-16 code unit).
 * - Include key iff `params[key] !== ''` and key is not `signature` / `response_signature_string`.
 *   Note: `null` / `undefined` pass this check; `Object.values(...).join('|')` turns them into
 *   empty segments (still distinct from omitting the key). Keep payloads free of those keys.
 * - Plaintext: `secret + '|' + Object.values(ordered).join('|')`
 * - SHA1 UTF-8, hex lowercase
 *
 * @see https://docs.flitt.com/api/building-signature/
 * @see https://github.com/flittpayments/node-js-sdk/blob/main/lib/util.js
 */
export function signFlittPayload(secret, params) {
  if (params == null || typeof params !== "object") {
    throw new TypeError("signFlittPayload: params must be an object");
  }
  const ordered = {};
  Object.keys(params)
    .sort()
    .forEach(function flittSignKey(key) {
      if (
        params[key] !== "" &&
        key !== "signature" &&
        key !== "response_signature_string"
      ) {
        ordered[key] = params[key];
      }
    });
  const signString = String(secret) + "|" + Object.values(ordered).join("|");
  return crypto.createHash("sha1").update(signString).digest("hex");
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
  const ordered = {};
  Object.keys(params)
    .sort()
    .forEach(function flittDescribeKey(key) {
      if (
        params[key] !== "" &&
        key !== "signature" &&
        key !== "response_signature_string"
      ) {
        ordered[key] = params[key];
      }
    });
  const sortedKeys = Object.keys(ordered);
  const valuesJoined = Object.values(ordered).join("|");
  const types = sortedKeys.reduce((acc, k) => {
    acc[k] = Array.isArray(ordered[k]) ? "array" : typeof ordered[k];
    return acc;
  }, {});
  return {
    sorted_keys: sortedKeys,
    values_joined_after_secret: valuesJoined,
    types,
  };
}

export function verifyFlittPayload(secret, raw) {
  if (!raw || typeof raw !== "object") return false;
  const sig = raw.signature;
  if (!sig || typeof sig !== "string") return false;
  const computed = signFlittPayload(secret, raw);
  return computed === String(sig).toLowerCase();
}
