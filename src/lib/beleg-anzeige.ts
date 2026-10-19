// Typen und Konstanten der Belegprüfung ohne Prisma-Import — Client-Komponenten dürfen nur aus dieser Datei
// importieren, nicht aus beleg-status.ts (zieht Prisma/pg ins Browser-Bundle, Turbopack liefert dann nur
// „ENOENT build-manifest.json“).
//
// BELEGT    = mindestens ein nicht ausgeblendetes Dokument an der Position (bei aufgeteilten Positionen genügt eins an
//             irgendeinem Teil der Gruppe — ein PDF, z.B. die Stadtwerke-Jahresabrechnung, deckt alle Teile).
// AUSNAHME  = „Kein Beleg nötig“ gesetzt, kein Dokument.
// FEHLT     = beleg-pflichtig, weder Dokument noch Ausnahme.
// ENTFAELLT = nicht beleg-pflichtig (siehe belegPflichtig in beleg-status.ts).
export type BelegStatus = "BELEGT" | "AUSNAHME" | "FEHLT" | "ENTFAELLT";

export const MAX_BELEG_AUSNAHME_GRUND = 300;
