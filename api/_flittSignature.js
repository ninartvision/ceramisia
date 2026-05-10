import crypto from "crypto";

/**
 * Mirrors flittpayments/node-js-sdk `lib/util.js` `genSignature` exactly:
 * - Sort keys lexicographically
 * - Include a key iff `params[key] !== ''` and key is not signature / response_signature_string
 * - Plaintext: `secret + '|' + Object.values(ordered).join('|')` (join uses JS ToString;
 *   null/undefined values become empty segments, same as SDK)
 * - SHA1 digest, hex, lowercase
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
