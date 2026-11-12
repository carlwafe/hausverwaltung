import type { MetadataRoute } from "next";

// Web-App-Manifest (/manifest.webmanifest): macht die Seite über „Zum Home-Bildschirm“ als App im
// Vollbild installierbar. Bewusst ohne Service Worker (siehe docs/tickets-logo-design.md, „PWA“).
// Die Datei ist in src/proxy.ts von der Anmeldung ausgenommen: Browser rufen das Manifest ohne
// Cookies ab und bekämen sonst die Login-Seite als HTML.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Mietverwaltung Eutin",
    short_name: "Mietverwaltung",
    description: "Buchhaltung für das Mietobjekt in Eutin",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Dunkles Design (bg-neutral-950). Im Betrieb setzt das Layout die Farbe der Statusleiste je
    // nach Design über <meta name="theme-color"> (generateViewport in layout.tsx).
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    // Schwarz auf Weiß ohne Transparenz: auf dunklem Startbildschirm wäre das transparente Logo
    // unsichtbar. Version im Dateinamen wie bei den übrigen Icons (Safari hält Icons je URL lange).
    icons: [
      { src: "/icons/logo-v2-app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/logo-v2-app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/logo-v2-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
