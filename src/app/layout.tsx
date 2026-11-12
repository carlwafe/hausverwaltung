import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mietverwaltung Eutin",
  description: "Buchhaltung für das Mietobjekt in Eutin",
  // Bewusst neue Dateinamen (Version im Namen): Safari hält Icons je URL sehr lange im Speicher und
  // zeigte nach dem Logo-Wechsel weiter das alte. Bei einer erneuten Änderung "v3" o. ä. verwenden.
  icons: {
    icon: [
      { url: "/icons/logo-v2.svg", type: "image/svg+xml" },
      { url: "/icons/logo-v2-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/logo-v2.ico", sizes: "48x48" },
    ],
    apple: [{ url: "/icons/logo-v2-apple.png", sizes: "180x180", type: "image/png" }],
  },
  // Installierte App (iPhone: „Zum Home-Bildschirm“). Das Manifest kommt aus src/app/manifest.ts.
  // statusBarStyle "default": Die Seite beginnt unter der Statusleiste, deren Schrift dem Gerät
  // folgt. Bei "black-translucent" läge die Navigation unter der Uhr und die Schrift wäre immer
  // weiß (im hellen Design unlesbar).
  appleWebApp: {
    capable: true,
    title: "Mietverwaltung",
    statusBarStyle: "default",
  },
};

const FARBE_HELL = "#ffffff";
const FARBE_DUNKEL = "#0a0a0a";

// Farbe der Statusleiste/Browserleiste passend zum Design: fest gewählt (Cookie "theme") genau
// diese Farbe, bei „System“ je nach Modus des Geräts. Bewusst kein viewportFit "cover": Es gibt
// keine am Rand fixierten Leisten, und mit "cover" läge der Inhalt im Querformat unter der Kerbe.
export async function generateViewport(): Promise<Viewport> {
  const theme = (await cookies()).get("theme")?.value;
  if (theme === "dark") return { themeColor: FARBE_DUNKEL };
  if (theme === "light") return { themeColor: FARBE_HELL };
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: FARBE_HELL },
      { media: "(prefers-color-scheme: dark)", color: FARBE_DUNKEL },
    ],
  };
}

// Setzt vor dem ersten Zeichnen das Design und folgt bei „System“ dem Modus des Geräts.
const THEME_SKRIPT = `(function(){try{var q=matchMedia("(prefers-color-scheme: dark)");function a(){var m=document.cookie.match(/(?:^|; )theme=(\\w+)/),p=m?m[1]:"system";document.documentElement.dataset.theme=p==="dark"||(p!=="light"&&q.matches)?"dark":"light"}a();q.addEventListener("change",a)}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Ohne Cookie gilt „System“; das Skript im <head> löst es sofort auf, hier nur der Ausgangswert.
  const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
  return (
    <html
      lang="de"
      data-theme={theme}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SKRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        {children}
      </body>
    </html>
  );
}
