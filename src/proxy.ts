import { withAuth } from "next-auth/middleware";

export default withAuth;

// Öffentlich (ohne Anmeldung): Icons für Browser/Lesezeichen, Logo für E-Mail-Köpfe und das
// Web-App-Manifest (src/app/manifest.ts) — Browser rufen es ohne Cookies ab und bekämen sonst die
// Login-Seite als HTML; die installierte App hätte dann weder Namen noch Icon.
export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|apple-touch-icon|icons/|email/|manifest.webmanifest).*)",
  ],
};
