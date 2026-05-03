import Stripe from "stripe";
import getRawBody from "raw-body";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  try {
    // 🔍 DEBUG
    console.log("KEY:", process.env.STRIPE_SECRET_KEY ? "OK" : "MISSING");

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Missing STRIPE_SECRET_KEY");
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const sig = req.headers["stripe-signature"];

    const rawBody = await getRawBody(req);

    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "payment_intent.succeeded") {
      console.log("💰 გადახდა წარმატებულია");
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.log("❌ ERROR:", err.message);
    return res.status(500).send("Error");
  }
}