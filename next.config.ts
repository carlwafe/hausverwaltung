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
  },
};

export default nextConfig;
