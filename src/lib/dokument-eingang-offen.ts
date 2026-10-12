// Dokumente im Eingang, die noch nicht erkannt sind (Regeln unsicher, Scan, Bild) und für die sich eine KI-Prüfung lohnt.
// Typen, die die App nie automatisch liest (Vertrag, Schreiben, Protokoll, Foto — siehe AUTOMATISCH_NICHT_LESEN), sind
// ausgenommen: ihr Inhalt geht nur auf ausdrücklichen Knopfdruck am einzelnen Dokument an Anthropic.
import type { Prisma } from "@/generated/prisma/client";
import { AUTOMATISCH_NICHT_LESEN } from "@/lib/dokumente-anzeige";
import { ERKENNBARE_TYPEN } from "@/lib/dokument-erkennung";

export const EINGANG_OFFEN_WHERE: Prisma.DokumentWhereInput = {
  eingang: true,
  ausgeblendetAm: null,
  erkanntAm: null,
  mimeType: { in: [...ERKENNBARE_TYPEN] },
  OR: [{ art: null }, { art: { notIn: [...AUTOMATISCH_NICHT_LESEN] } }],
};
