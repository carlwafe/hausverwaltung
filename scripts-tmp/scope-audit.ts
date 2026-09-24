import { prisma } from "../src/lib/prisma";
import { mapKostenRows, type GebaeudeKandidat, type EinheitKandidat, type MieterKandidat } from "../src/lib/import/kosten-import";
import { gebaeudeAuswahlWert } from "../src/lib/gebaeude-gruppen";
import { AKTIVE_BUCHUNG_FILTER } from "../src/lib/buchung-storno";

async function main() {
  const [buchungen, gebaeudeRaw, einheitenRaw, vertraege, kg, haeuser] = await Promise.all([
    prisma.buchung.findMany({
      where: { buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER },
      include: { kostenart: true },
    }),
    prisma.gebaeude.findMany({ include: { haus: true, kostengruppen: { select: { id: true, bezeichnung: true } } } }),
    prisma.einheit.findMany({ include: { gebaeude: true } }),
    prisma.mietvertrag.findMany({ include: { mieter: true, einheit: true } }),
    prisma.kostengruppe.findMany(),
    prisma.haus.findMany({ include: { gebaeude: true } }),
  ]);
  const gebaeude: GebaeudeKandidat[] = gebaeudeRaw.map((g) => ({ id: g.id, label: `${g.strasse} ${g.hausnummer}`, strasse: g.strasse, hausnummer: g.hausnummer, haus: g.haus, kostengruppen: g.kostengruppen }));
  const einheiten: EinheitKandidat[] = einheitenRaw.map((e) => ({ id: e.id, gebaeudeId: e.gebaeudeId, bezeichnung: e.bezeichnung }));
  const mieter: MieterKandidat[] = vertraege.flatMap((v) => v.mieter.map((m) => ({ vorname: m.vorname, nachname: m.nachname, einheitId: v.einheit.id, einheitTyp: v.einheit.typ })));
  const einheitById = new Map(einheitenRaw.map((e) => [e.id, e]));
  const gebaeudeById = new Map(gebaeudeRaw.map((g) => [g.id, g]));
  void gebaeudeById; void kg; void haeuser;

  const headers = ["Buchungstag", "Betrag", "Verwendungszweck", "Name"];
  const rows = buchungen.map((b) => ({
    Buchungstag: "01.01.2025", Betrag: "-10,00",
    Verwendungszweck: b.verwendungszweck ?? "", Name: b.empfaenger ?? "",
  }));
  const parsed = mapKostenRows(headers, rows, [], gebaeude, mieter, new Set(), null, new Set(), einheiten);

  type Kat = "ok" | "objekt_zu_scope" | "verfeinerbar_einheit" | "konflikt" | "kein_vorschlag";
  const zaehler: Record<Kat, number> = { ok: 0, objekt_zu_scope: 0, verfeinerbar_einheit: 0, konflikt: 0, kein_vorschlag: 0 };
  const beispiele: Record<Kat, string[]> = { ok: [], objekt_zu_scope: [], verfeinerbar_einheit: [], konflikt: [], kein_vorschlag: [] };
  const proKostenart: Record<string, Record<string, number>> = {};

  const label = (w: string | null | undefined): string => {
    if (!w) return "Objekt gesamt";
    const [typ, id] = w.split(":");
    if (typ === "gebaeude") { const g = gebaeudeRaw.find((x) => x.id === id); return g ? `Geb ${g.hausnummer}` : w; }
    if (typ === "haus") { const h = haeuser.find((x) => x.id === id); return h ? `Haus ${h.gebaeude.map((g) => g.hausnummer).sort((a,b)=>+a-+b).join(",")}` : w; }
    if (typ === "kostengruppe") return `KG ${kg.find((x) => x.id === id)?.bezeichnung}`;
    if (typ === "einheit") return `Einheit ${einheitById.get(id)?.bezeichnung}`;
    return w;
  };

  buchungen.forEach((b, i) => {
    const aktuell = gebaeudeAuswahlWert(b.gebaeudeId, b.hausId, b.kostengruppeId, b.einheitId) || null;
    const vorschlag = parsed[i].vorgeschlageneGebaeudeAuswahl;
    let kat: Kat;
    if (vorschlag === undefined || vorschlag === null || parsed[i].ignorieren || parsed[i].errors.length) kat = "kein_vorschlag";
    else if (vorschlag === aktuell) kat = "ok";
    else if (!aktuell) kat = "objekt_zu_scope";
    else if (vorschlag.startsWith("einheit:")) {
      const e = einheitById.get(vorschlag.split(":")[1])!;
      const imScope = (aktuell.startsWith("gebaeude:") && aktuell.split(":")[1] === e.gebaeudeId)
        || (aktuell.startsWith("haus:") && gebaeudeRaw.find((g) => g.id === e.gebaeudeId)?.hausId === aktuell.split(":")[1])
        || (aktuell.startsWith("kostengruppe:") && gebaeudeRaw.find((g) => g.id === e.gebaeudeId)?.kostengruppen.some((k) => k.id === aktuell.split(":")[1]));
      kat = imScope ? "verfeinerbar_einheit" : "konflikt";
    } else kat = "konflikt";
    zaehler[kat]++;
    const kn = b.kostenart?.name ?? "?";
    (proKostenart[kn] ??= {})[kat] = (proKostenart[kn][kat] ?? 0) + 1;
    if (beispiele[kat].length < 12 && kat !== "ok" && kat !== "kein_vorschlag")
      beispiele[kat].push(`${b.datum?.toISOString().slice(0,10)} ${Number(b.betrag).toFixed(2)}€ [${kn}] aktuell=${label(aktuell)} -> Vorschlag=${label(vorschlag)} | ${(b.verwendungszweck ?? "").slice(0,80)} | ${b.empfaenger ?? ""}`);
  });
  console.log("Gesamt aktive Kostenpositionen:", buchungen.length);
  console.log(zaehler);
  for (const k of ["objekt_zu_scope", "verfeinerbar_einheit", "konflikt"] as Kat[]) {
    console.log(`\n=== ${k} (${zaehler[k]}) – Beispiele ===`);
    beispiele[k].forEach((x) => console.log(" ", x));
  }
  console.log("\nPro Kostenart (nur Auffälligkeiten):");
  for (const [kn, m] of Object.entries(proKostenart)) {
    const a = (m.objekt_zu_scope ?? 0) + (m.verfeinerbar_einheit ?? 0) + (m.konflikt ?? 0);
    if (a) console.log(" ", kn.padEnd(32), JSON.stringify(m));
  }
}
main().then(() => prisma.$disconnect());
