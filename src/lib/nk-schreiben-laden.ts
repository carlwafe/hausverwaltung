// Lädt die Daten für die Schreiben „Betriebskostenabrechnung“ aus der DB (nur lesend) und baut daraus
// SchreibenInhalt (nk-schreiben.ts → schreiben-pdf.ts). Genutzt von der Route /api/nebenkostenabrechnung/schreiben
// und von Skripten (scripts-tmp/nk-schreiben.ts).
import { prisma } from "@/lib/prisma";
import { effektiverStichtag } from "@/lib/buchhaltung-stichtag";
import { istWarmeKostenart } from "@/lib/kostenart-warm";
import { unbezahlteNkVorauszahlung } from "@/lib/nk-saldo";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";
import { baueNkSchreiben, berechneArbeitskostenZeilen, type NkSchreibenDaten } from "@/lib/nk-schreiben";
import { ladeArbeitskostenStand } from "@/lib/arbeitskosten";
import { erzeugeSchreibenPdf, type SchreibenInhalt } from "@/lib/schreiben-pdf";

/**
 * Die Anschrift der Vermieterin steht am Objekt als ein Text („Postfach 13036820103 Hamburg“, ohne Trennzeichen
 * zwischen Postfachnummer und PLZ). Zerlegt in „Postfach 130368 · 20103 Hamburg“ und den Ort („Hamburg“).
 */
export function zerlegeAbsenderAnschrift(text: string | null | undefined): { zeile: string; ort: string } {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { zeile: "", ort: "" };
  if (/[,;\n·]/.test(text ?? "")) {
    const teile = t.split(/\s*[,;·]\s*/).filter(Boolean);
    const ortTeil = teile[teile.length - 1].replace(/^\d{5}\s+/, "");
    return { zeile: teile.join(" · "), ort: ortTeil };
  }
  const m = t.match(/^(.*?)(\d{5})\s+(\D+)$/);
  if (m) return { zeile: `${m[1].trim()} · ${m[2]} ${m[3].trim()}`, ort: m[3].trim() };
  return { zeile: t, ort: "" };
}

export type NkSchreibenErgebnis = {
  jahr: number;
  schreiben: { mietvertragId: string; name: string; inhalt: SchreibenInhalt; daten: NkSchreibenDaten }[];
  uebersprungen: { name: string; grund: string }[];
};

/** Wohnung/Garage als Kurzbezeichnung: Teil der Einheit-Bezeichnung vor „ - “ (z.B. „HS 2 WHG 4“). */
const kurzbezeichnung = (bezeichnung: string) => bezeichnung.split(" - ")[0].trim();

export async function ladeNkSchreiben(
  abrechnungId: string,
  o: { mietvertragIds?: string[]; datum: Date; frist: Date | null },
): Promise<NkSchreibenErgebnis | null> {
  const abrechnung = await prisma.nebenkostenabrechnung.findUnique({
    where: { id: abrechnungId },
    include: {
      positionen: {
        where: { mietvertragId: o.mietvertragIds ? { in: o.mietvertragIds } : { not: null } },
        include: {
          einheit: { include: { gebaeude: { select: { strasse: true, hausnummer: true, objekt: { select: { plz: true, ort: true } } } } } },
          mietvertrag: { include: { mieter: true, mieterhoehungen: true } },
        },
      },
    },
  });
  if (!abrechnung) return null;

  const objekt = await prisma.objekt.findFirst();
  const absenderAnschrift = zerlegeAbsenderAnschrift(objekt?.sepaGlaeubigerAnschrift);
  const absender = {
    name: objekt?.sepaGlaeubigerName?.trim() || objekt?.mietkontoInhaber?.trim() || "Vermieterin",
    anschriftZeile: absenderAnschrift.zeile,
    ort: absenderAnschrift.ort,
    email: objekt?.emailMieter,
    telefon: objekt?.telefonMieter,
  };
  const konto = objekt?.mietkontoIban
    ? { inhaber: objekt.mietkontoInhaber?.trim() || absender.name, iban: objekt.mietkontoIban, bic: objekt.mietkontoBic, bank: objekt.mietkontoBank }
    : null;

  const kostenartIds = new Set<string>();
  for (const p of abrechnung.positionen) for (const d of (p.details as KostenanteilDetailEintrag[] | null) ?? []) kostenartIds.add(d.kostenartId);
  const kostenarten = await prisma.kostenart.findMany({ where: { id: { in: [...kostenartIds] } }, select: { id: true, name: true, betrKvNummer: true } });
  const warmById = new Map(kostenarten.map((k) => [k.id, istWarmeKostenart(k)]));

  // Arbeitskosten-Quoten (§ 35a EStG): nur Kostenarten, bei denen alle Positionen des Jahres eine Angabe haben.
  const arbeitskostenQuoten = new Map(
    (await ladeArbeitskostenStand(abrechnung.jahr)).filter((k) => k.vollstaendig && k.quote !== null).map((k) => [k.kostenartId, k.quote as number]),
  );

  const ergebnis: NkSchreibenErgebnis = { jahr: abrechnung.jahr, schreiben: [], uebersprungen: [] };
  const mieterNameKurz = (m: { vorname: string; nachname: string }) => [m.vorname, m.nachname].map((x) => x.trim()).filter(Boolean).join(" ");

  for (const p of abrechnung.positionen) {
    const v = p.mietvertrag;
    if (!v) continue;
    const name = `${kurzbezeichnung(p.einheit.bezeichnung)} – ${v.mieter.map(mieterNameKurz).join(" & ")}`;
    const details = (p.details as KostenanteilDetailEintrag[] | null) ?? [];
    if (details.length === 0) {
      ergebnis.uebersprungen.push({ name, grund: "Manuelle Position ohne Aufschlüsselung — das Schreiben braucht die berechnete Kostenaufstellung." });
      continue;
    }
    if (v.mieter.length === 0) {
      ergebnis.uebersprungen.push({ name, grund: "Kein Mieter am Vertrag." });
      continue;
    }
    const g = p.einheit.gebaeude;
    const beendet = v.status === "BEENDET";
    const unbezahlt = unbezahlteNkVorauszahlung(
      {
        kaltmiete: Number(v.kaltmiete),
        nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
        mieterhoehungen: v.mieterhoehungen.map((m) => ({
          gueltigAb: m.gueltigAb,
          kaltmiete: Number(m.kaltmiete),
          nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
        })),
      },
      { zeitraumVon: p.zeitraumVon, zeitraumBis: p.zeitraumBis, vorauszahlungGesamt: Number(p.vorauszahlungGesamt) },
      effektiverStichtag(v, objekt),
    );
    const daten: NkSchreibenDaten = {
      jahr: abrechnung.jahr,
      absender,
      datum: o.datum,
      frist: o.frist,
      mieter: v.mieter.map((m) => ({ anrede: m.anrede, vorname: m.vorname, nachname: m.nachname })),
      // Die Anschrift der Mieter ist die Wohnung; ausgezogene Mieter haben eine neue Anschrift, die nicht in der App steht.
      empfaengerAnschrift: beendet ? ["[neue Anschrift ergänzen]"] : [`${g.strasse} ${g.hausnummer}`, `${g.objekt.plz} ${g.objekt.ort}`],
      wohnung: kurzbezeichnung(p.einheit.bezeichnung),
      wohnungLage: p.einheit.bezeichnung.includes(" - ") ? p.einheit.bezeichnung.split(" - ").slice(1).join(" - ").trim() || undefined : undefined,
      objektAnschrift: `${g.strasse} ${g.hausnummer}, ${g.objekt.plz} ${g.objekt.ort}`,
      zeitraumVon: p.zeitraumVon,
      zeitraumBis: p.zeitraumBis,
      kostenanteil: Number(p.kostenanteilGesamt),
      vorauszahlung: Number(p.vorauszahlungGesamt),
      saldo: Number(p.saldo),
      unbezahlteVorauszahlung: unbezahlt > 0.005 ? unbezahlt : 0,
      details: details.map((d) => ({ ...d, warm: warmById.get(d.kostenartId) ?? false })),
      arbeitskosten: berechneArbeitskostenZeilen(details, arbeitskostenQuoten),
      zahlungsweg: v.zahlungsweg,
      konto,
    };
    ergebnis.schreiben.push({ mietvertragId: v.id, name, inhalt: baueNkSchreiben(daten), daten });
  }
  ergebnis.schreiben.sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
  return ergebnis;
}

export async function nkSchreibenAlsPdf(e: NkSchreibenErgebnis): Promise<Uint8Array> {
  return erzeugeSchreibenPdf(e.schreiben.map((s) => s.inhalt), `Betriebskostenabrechnung ${e.jahr}`);
}
