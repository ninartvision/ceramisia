# Backend (local reference only)

**Vercel does not run `server.js` or files under `backend/api/`.**

- Serverless API lives in the **project root** [`../api/`](../api/) — that becomes `https://<your-domain>/api/*`.
- For local development that matches production, run from the repo root:

  ```bash
  npx vercel dev
  ```

- The old Express app in `server.js` was for local testing only. Use `/api/pay` (full flow + Supabase) or `/api/payment` (simple amount-only BOG) on Vercel instead.
