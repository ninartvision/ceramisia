/**
 * Optional CMS mirror for checkout flows. Never blocks payment — callers fire-and-forget.
 * Set SANITY_SKIP_ORDER_SYNC=1 to disable. Token must allow creating documents of type "order".
 */

function skipSyncEnabled() {
  const v = process.env.SANITY_SKIP_ORDER_SYNC;
  if (v == null || v === "") return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

export async function trySanityCreateOrder(client, doc, contextTag) {
  const tag = contextTag || "checkout";

  if (skipSyncEnabled()) {
    console.log(`[Sanity:${tag}] skipped — SANITY_SKIP_ORDER_SYNC`);
    return { skipped: true, reason: "SANITY_SKIP_ORDER_SYNC" };
  }

  const tok = process.env.SANITY_API_TOKEN?.trim();
  if (!tok) {
    console.error(
      `[Sanity:${tag}] SANITY_API_TOKEN missing — add token at https://sanity.io/manage → API → Tokens`
    );
    return { skipped: true, reason: "NO_TOKEN" };
  }

  try {
    await client.create(doc);
    console.log(`[Sanity:${tag}] order document created`);
    return { ok: true };
  } catch (err) {
    const msg = String(err?.message || err);
    const status = err?.statusCode ?? err?.response?.statusCode;
    const desc = Array.isArray(err?.details)
      ? err.details.map((d) => String(d?.description || "")).join(" ")
      : "";
    const permDenied =
      status === 403 ||
      /\bpermission\b.*\bcreate\b|\bcreate\b.*required|insufficient permissions/i.test(
        `${msg} ${desc}`
      );

    console.error(`[Sanity:${tag}] client.create failed:`, msg);
    if (err?.response?.body != null) {
      const b = err.response.body;
      console.error(
        "[Sanity] response body:",
        typeof b === "string" ? b : JSON.stringify(b, null, 2).slice(0, 4000)
      );
    }
    if (err?.details) {
      console.error(
        "[Sanity] details:",
        typeof err.details === "string"
          ? err.details
          : JSON.stringify(err.details, null, 2).slice(0, 4000)
      );
    }

    if (permDenied) {
      console.error(
        `[Sanity:${tag}] FIX: use a token with Editor role (or Contributor + create on "order") — https://sanity.io/manage → Project → API → Tokens`
      );
    }

    return { ok: false, permissionDenied: permDenied };
  }
}
