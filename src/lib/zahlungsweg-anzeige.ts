// Ohne Prisma-Import, damit auch Client-Komponenten Typ und Beschriftungen nutzen können.
export type ZahlungswegArt = "LASTSCHRIFT" | "UEBERWEISUNG" | "BEHOERDE";

export const ZAHLUNGSWEG_LABEL: Record<ZahlungswegArt, string> = {
  LASTSCHRIFT: "SEPA-Lastschrift",
  UEBERWEISUNG: "Überweisung / Dauerauftrag",
  BEHOERDE: "Amt zahlt (Jobcenter, Kreis)",
};
