import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next.js begrenzt den Body einer Server Action standardmäßig auf 1 MB — reicht für eine
    // einzelne Datei (siehe die 1-MB-Prüfung pro Datei in FotosSektion), nicht aber für mehrere
    // Fotos in einem Upload, deren Multipart-Body in Summe über 1 MB liegt. Großzügig genug für
    // z.B. 15+ Fotos à 1 MB in einem Upload.
    serverActions: {
      bodySizeLimit: "20mb",
    },
    // Turbopack-Cache auf Platte nur für `next dev` abschalten (der Build ist nicht betroffen).
    // Next 16.4.x: Nach einem Neustart des Dev-Servers über ein bestehendes `.next/dev` lud sich
    // jede Seite im Browser endlos neu ("HMR hash mismatch", vercel/next.js#100267). Preis: Der
    // erste Aufruf nach jedem Serverstart kompiliert kalt. Wieder einschalten, sobald der Fehler
    // in Next behoben ist (Prüfung: docs/lokal-testen.md).
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
