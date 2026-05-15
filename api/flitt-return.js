/**
 * Flitt/TBC browser return (POST). Static success.html only accepts GET on Vercel.
 * POST here → 303 redirect → GET /success.html (verification unchanged).
 */

const FLITT_ORDER_ID_RE = /^flt_[0-9a-f-]{36}$/i;

function normalizeReturnBody(body) {
  if (!body || typeof body !== "object") return {};
  if (body.response && typeof body.response === "object") {
    return body.response;
  }
  return body;
}

function pickOrderId(payload, query) {
  const fromBody = payload?.order_id ?? payload?.orderId ?? "";
  const fromQuery = query?.order_id ?? query?.orderId ?? "";
  const raw = String(fromBody || fromQuery || "").trim();
  return FLITT_ORDER_ID_RE.test(raw) ? raw : "";
}

function buildSuccessRedirect(orderId) {
  if (orderId) {
    return `/success.html?order_id=${encodeURIComponent(orderId)}`;
  }
  return "/success.html";
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const orderId = pickOrderId({}, req.query);
      const location = buildSuccessRedirect(orderId);
      console.log("[flitt-return] GET redirect to success", {
        order_id: orderId || null,
        location,
      });
      return res.redirect(303, location);
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = body ? JSON.parse(body) : {};
      } catch {
        body = {};
      }
    }

    const payload = normalizeReturnBody(body);
    const orderId = pickOrderId(payload, req.query);

    console.log("[flitt-return] received Flitt browser return", {
      order_id: orderId || null,
      response_status: payload?.response_status ?? null,
      order_status: payload?.order_status ?? null,
    });

    const location = buildSuccessRedirect(orderId);
    console.log("[flitt-return] redirect to success", { order_id: orderId || null, location });

    return res.redirect(303, location);
  } catch (err) {
    console.error("[flitt-return] error", { message: err?.message });
    return res.redirect(303, "/success.html");
  }
}
