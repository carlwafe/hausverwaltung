import { withAuth } from "next-auth/middleware";

export default withAuth;

// Öffentlich (ohne Anmeldung): Icons für Browser/Lesezeichen und Logo für E-Mail-Köpfe.
export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|apple-touch-icon|icons/|email/).*)",
  ],
};
