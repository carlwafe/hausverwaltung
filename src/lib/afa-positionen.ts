import { prisma } from "@/lib/prisma";
import { hausLabel } from "@/lib/gebaeude-gruppen";

// Einzelposten der Anschaffungs-/Herstellungskosten (Kostenarten mit Einordnung „Anschaffung /
// Herstellung“) für die Aufstellung an den Steuerberater: Er braucht je Anschaffung Datum, Objekt und
// Betrag, um die Abschreibung (Nutzungsdauer, Gebäude oder bewegliches Wirtschaftsgut) selbst zu bestimmen.
export type AfaPosition = {
  id: string;
  datum: Date | null;
  jahr: number | null;
  kostenart: string;
  objekt: string;
  empfaenger: string;
  text: string;
  // Vermietung der Wohnung zum Zeitpunkt der Anschaffung (Beginn der Abschreibung hängt davon ab, ab wann
  // die Wohnung bezugsfertig/vermietet ist), z.B. „Mietvertrag seit 01.03.2026“; leer bei Gebäude-Kosten.
  vermietung: string;
  betrag: number; // wie die Kostenposition: positiv = Ausgabe, negativ = Gutschrift
};

type KostenpositionFuerAfa = {
  id: string;
  datum: Date | null;
  jahr: number | null;
  betrag: { toString(): string } | number;
  empfaenger: string | null;
  verwendungszweck: string | null;
  einheitId: string | null;
  gebaeudeId: string | null;
  hausId: string | null;
  kostengruppeId: string | null;
  kostenart: { name: string } | null;
};

const tag = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

type Vertrag = { beginn: Date | null; ende: Date | null };

// Mietvertrag der Wohnung zum Datum der Anschaffung: läuft einer, gilt dessen Beginn; sonst der nächste
// Mietbeginn danach; sonst kein Vertrag erfasst. Kein Übergabedatum — das steht nicht in den Daten.
function vermietungText(vertraege: Vertrag[], datum: Date | null): string {
  if (vertraege.length === 0) return "kein Mietvertrag erfasst";
  if (!datum) return "";
  const laufend = vertraege.find((v) => (!v.beginn || v.beginn <= datum) && (!v.ende || v.ende >= datum));
  if (laufend) return laufend.beginn ? `Mietvertrag seit ${tag(laufend.beginn)}` : "Mietvertrag läuft";
  const spaeter = vertraege
    .filter((v) => v.beginn && v.beginn > datum)
    .sort((a, b) => a.beginn!.getTime() - b.beginn!.getTime())[0];
  return spaeter ? `nächster Mietbeginn ${tag(spaeter.beginn!)}` : "zum Zeitpunkt nicht vermietet";
}

// Lädt die Bezeichnung des Objekts (Wohnung, Gebäude, Haus, Kostengruppe) nur für die übergebenen
// Positionen — meist eine Handvoll, daher nur vier kleine Abfragen und nur, wenn es etwas zu laden gibt.
export async function ladeAfaPositionen(positionen: KostenpositionFuerAfa[]): Promise<AfaPosition[]> {
  if (positionen.length === 0) return [];
  const ids = (feld: "einheitId" | "gebaeudeId" | "hausId" | "kostengruppeId") => [
    ...new Set(positionen.map((p) => p[feld]).filter((id): id is string => !!id)),
  ];
  const [einheiten, gebaeude, haeuser, gruppen] = await Promise.all([
    ids("einheitId").length
      ? prisma.einheit.findMany({
          where: { id: { in: ids("einheitId") } },
          select: { id: true, bezeichnung: true, mietvertraege: { select: { beginn: true, ende: true } } },
        })
      : [],
    ids("gebaeudeId").length
      ? prisma.gebaeude.findMany({
          where: { id: { in: ids("gebaeudeId") } },
          select: { id: true, strasse: true, hausnummer: true },
        })
      : [],
    ids("hausId").length
      ? prisma.haus.findMany({
          where: { id: { in: ids("hausId") } },
          select: { id: true, gebaeude: { select: { strasse: true, hausnummer: true } } },
        })
      : [],
    ids("kostengruppeId").length
      ? prisma.kostengruppe.findMany({ where: { id: { in: ids("kostengruppeId") } }, select: { id: true, bezeichnung: true } })
      : [],
  ]);
  const einheitName = new Map(einheiten.map((e) => [e.id, e.bezeichnung]));
  const einheitVertraege = new Map(einheiten.map((e) => [e.id, e.mietvertraege]));
  const gebaeudeName = new Map(gebaeude.map((g) => [g.id, `${g.strasse} ${g.hausnummer}`]));
  const hausName = new Map(haeuser.map((h) => [h.id, hausLabel(h.gebaeude)]));
  const gruppeName = new Map(gruppen.map((g) => [g.id, g.bezeichnung]));

  return positionen
    .map((p) => ({
      id: p.id,
      datum: p.datum,
      jahr: p.jahr,
      kostenart: p.kostenart?.name ?? "Unbekannt",
      objekt:
        (p.einheitId && einheitName.get(p.einheitId)) ||
        (p.gebaeudeId && gebaeudeName.get(p.gebaeudeId)) ||
        (p.hausId && hausName.get(p.hausId)) ||
        (p.kostengruppeId && gruppeName.get(p.kostengruppeId)) ||
        "Gesamtes Objekt",
      empfaenger: p.empfaenger ?? "",
      text: (p.verwendungszweck ?? "").replace(/\s+/g, " ").trim(),
      vermietung: p.einheitId ? vermietungText(einheitVertraege.get(p.einheitId) ?? [], p.datum) : "",
      betrag: Number(p.betrag),
    }))
    .sort((a, b) => (a.datum?.getTime() ?? 0) - (b.datum?.getTime() ?? 0));
}
