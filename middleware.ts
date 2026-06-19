/**
 * Edge auth gate — protects /app (panik-core) and /api routes only.
 *
 * The landing page + waitlist (/) is PUBLIC so anyone can sign up.
 * The product app (/app) and backend API (/api) require HTTP Basic Auth;
 * credentials live in Vercel env vars (BASIC_AUTH_USER / BASIC_AUTH_PASS).
 *
 * Set in Vercel → Project → Settings → Environment Variables:
 *   BASIC_AUTH_USER, BASIC_AUTH_PASS
 */
export const config = {
  // Only gate /app and /api routes — landing page is public.
  matcher: ["/app/:path*", "/api/:path*"],
};

export default function middleware(req: Request): Response | undefined {
  const USER = process.env.BASIC_AUTH_USER;
  const PASS = process.env.BASIC_AUTH_PASS;

  // Fail closed: if the gate isn't configured yet, block protected routes.
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
      if (user === USER && pass === PASS) return; // authorized → continue
    } catch {
      /* malformed header → fall through to 401 */
    }
  }
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="PANIK — private", charset="UTF-8"' },
  });
}
