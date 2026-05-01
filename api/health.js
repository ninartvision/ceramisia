/**
 * GET /api/health
 * Confirms Vercel detected your `api/` folder and routing works.
 */
export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    path: "/api/health",
    ts: new Date().toISOString(),
  });
}
