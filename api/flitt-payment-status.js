import { getCompletedOrder } from "./_db.js";

const FLITT_ORDER_ID_RE = /^flt_[0-9a-f-]{36}$/i;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    return res.status(405).json({ paid: false, error: "Method Not Allowed" });
  }

  const orderId = String(req.query?.order_id || "").trim();
  if (!orderId || !FLITT_ORDER_ID_RE.test(orderId)) {
    return res.status(400).json({ paid: false, error: "Invalid order_id" });
  }

  try {
    const completed = await getCompletedOrder(orderId);
    const paid =
      Boolean(completed) &&
      String(completed.status || "").toLowerCase() === "approved";
    return res.status(200).json({
      paid,
      order_id: orderId,
    });
  } catch (err) {
    console.error("[flitt-payment-status] error", {
      order_id: orderId,
      message: err?.message,
    });
    return res.status(500).json({ paid: false, error: "Server error" });
  }
}
