/**
 * Ceramisia – BOG Payment Callback
 * Route: POST /api/callback
 *
 * BOG calls this URL server-to-server after every payment attempt.
 * It sends a signed payload with the order status.
 *
 * BOG retries the callback if it doesn't receive HTTP 200.
 * Always respond 200 quickly — do validation/processing after.
 *
 * Typical payload fields:
 *   order_id          – BOG internal order ID
 *   external_order_id – The ID we sent (e.g. "order_1713800000000")
 *   payment_status    – "SUCCESS" | "FAILED" | "REFUNDED" | "PARTIAL_REFUND"
 *   payment_detail    – { amount, currency, card_type, pan, ... }
 */

export default async function handler(req, res) {
  // BOG only POSTs to this endpoint
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const payload = req.body;

    const orderId         = payload?.order_id         || '—';
    const externalOrderId = payload?.external_order_id || '—';
    const status          = payload?.payment_status    || '—';
    const detail          = payload?.payment_detail    || {};

    console.log('[BOG Callback]', {
      order_id:          orderId,
      external_order_id: externalOrderId,
      payment_status:    status,
      amount:            detail.amount,
      currency:          detail.currency,
      card_type:         detail.card_type,
      timestamp:         new Date().toISOString(),
    });

    // ── Act on status ──────────────────────────────────────────────────────────
    if (status === 'SUCCESS') {
      // TODO: mark order as paid in your database
      // e.g. await db.orders.update({ external_order_id: externalOrderId, paid: true });
    }

    if (status === 'FAILED') {
      // TODO: mark order as failed / notify admin
    }

    if (status === 'REFUNDED' || status === 'PARTIAL_REFUND') {
      // TODO: handle refund confirmation
    }

    // Always return 200 immediately — BOG will retry on any other status
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[BOG Callback] parse error:', err.message);
    // Still return 200 to stop BOG retries; log the error for investigation
    return res.status(200).json({ received: true });
  }
}
