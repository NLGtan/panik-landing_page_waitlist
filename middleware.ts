/**
 * Edge auth gate — makes the whole Vercel deployment "private link only".
 *
 * Every request must pass HTTP Basic Auth; the credentials live in Vercel env
 * vars (BASIC_AUTH_USER / BASIC_AUTH_PASS), never in the client bundle. The
 * "private link" is the deployment URL + the shared password your team holds.
 *
 * Runs at the edge before any static asset is served, so nothing — not the
 * landing page, the app, or any file — is reachable without the password.
 * The scoring core never ships to the browser regardless (it lives behind the
 * /api backend), so this only gates the public surface.
 *
 * Set in Vercel → Project → Settings → Environment Variables:
 *   BASIC_AUTH_USER, BASIC_AUTH_PASS
 */
export const config = {
  // Gate everything except Vercel internals.
  matcher: "/((?!_vercel|_next/static|favicon.ico).*)",
};

export default function middleware(req: Request): Response | undefined {
  const USER = process.env.BASIC_AUTH_USER;
  const PASS = process.env.BASIC_AUTH_PASS;

  // Fail closed: if the gate isn't configured yet, do NOT serve the site.
  if (!USER || !PASS) {
    return new Response(
      "Access control not configured. Set BASIC_AUTH_USER and BASIC_AUTH_PASS in Vercel env vars.",
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const [user, pass] = atob(header.slice(6)).split(":");
      if (user === USER && pass === PASS) return; // authorized → continue to the site
    } catch {
      /* malformed header → fall through to 401 */
    }
  }
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="PANIK — private", charset="UTF-8"' },
  });
}
