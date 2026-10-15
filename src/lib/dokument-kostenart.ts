// Kostenart eines erkannten Dokuments absichern: Hat ein Dienstleister mehrere gleichartige Kostenarten (z.B. Strom Garagen und
// Allgemeinstrom bei demselben Stromlieferanten), kann weder die KI noch die Regel-Erkennung am Dokument allein sehen, welche gemeint
// ist — das PDF nennt nur „Strom“ und die Verbrauchsstelle. Dann entscheidet die Buchungshistorie derselben Verbrauchsstelle
// (bisher gebuchte Kostenpositionen dieses Dienstleisters, deren Verwendungszweck dieselbe Adresse nennt); gibt es dort genau
// eine Kostenart, wird sie vorgeschlagen, sonst bleibt das Feld leer (lieber nichts als geraten).
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import type { Erkennung, ErkennungErgebnis } from "@/lib/dokument-erkennung";
import { findeDienstleister, parseSuchbegriffe, type DienstleisterKandidat } from "@/lib/import/dienstleister";
import { prisma } from "@/lib/prisma";

type KostenartInfo = { id: string; name: string };

/** Sparte einer Kostenart nach ihrem Namen: Zwei Kostenarten derselben Sparte kann ein Dokument nicht sicher unterscheiden. */
export function sparteVon(name: string): string {
  const n = adressText(name);
  if (/strom\b/.test(n)) return "strom";
  if (/\bgas\b/.test(n)) return "gas";
  if (/wasser|abwasser/.test(n)) return "wasser";
  if (/heiz|waerme|fernwaerme/.test(n)) return "waerme";
  return n;
}

// Kleinschreibung, ß/Umlaute aufgelöst, alles außer Buchstaben/Ziffern zu einem Leerzeichen, „Str.“ zu „Strasse“.
function adressText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/(\w)str\b/g, "$1strasse")
    .replace(/\bstr\b/g, "strasse")
    .replace(/\s+/g, " ")
    .trim();
}

const STRASSE = /([a-z]+ (?:strasse|weg|allee|platz|ring|damm|gasse)) (\d+[a-z]?|[a-z])(?= |$)/g;

/** „Breslauer Straße 2, 23701 Eutin“ → {„breslauer strasse 2“}; mehrere Nummern („2/6“) zählen nur mit der ersten. */
export function adressSchluessel(text: string): Set<string> {
  const keys = new Set<string>();
  for (const m of adressText(text).matchAll(STRASSE)) keys.add(`${m[1]} ${m[2]}`);
  return keys;
}

/**
 * Kostenarten des Dienstleisters, die dieselbe Sparte wie die gewählte haben (mindestens zwei, inklusive der gewählten) — dann ist die
 * Wahl allein aus dem Dokument nicht verlässlich. Sonst null: Kostenart nicht aus dem Dienstleister oder die Sparte ist eindeutig.
 */
export function gleichartigeKostenarten(gewaehlt: string | null | undefined, dienstleisterKostenarten: KostenartInfo[]): KostenartInfo[] | null {
  const g = dienstleisterKostenarten.find((k) => k.id === gewaehlt);
  if (!g) return null;
  const sparte = sparteVon(g.name);
  const gleiche = dienstleisterKostenarten.filter((k) => sparteVon(k.name) === sparte);
  return gleiche.length > 1 ? gleiche : null;
}

type DienstleisterMitKostenarten = DienstleisterKandidat & { kostenarten: KostenartInfo[] };

async function ladeDienstleister(): Promise<DienstleisterMitKostenarten[]> {
  const zeilen = await prisma.dienstleister.findMany({
    select: { id: true, name: true, suchbegriffe: true, kostenarten: { select: { id: true, name: true } } },
  });
  return zeilen.map((d) => ({
    id: d.id,
    name: d.name,
    suchbegriffe: [...parseSuchbegriffe(d.suchbegriffe ?? ""), d.name],
    kostenartIds: d.kostenarten.map((k) => k.id),
    kostenarten: d.kostenarten,
  }));
}

// Kostenarten, die bisher an dieser Verbrauchsstelle (Adresse) bei diesem Dienstleister gebucht wurden, eingeschränkt auf `kandidaten`.
async function ladeHistorie(dienstleister: DienstleisterMitKostenarten, kandidaten: KostenartInfo[], adressen: Set<string>): Promise<Set<string>> {
  const ids = new Set<string>();
  if (adressen.size === 0) return ids;
  const zeilen = await prisma.buchung.findMany({
    where: { ...AKTIVE_BUCHUNG_FILTER, buchungsart: { code: "KOSTENPOSITION" }, kostenartId: { in: kandidaten.map((k) => k.id) } },
    select: { kostenartId: true, empfaenger: true, verwendungszweck: true, gebaeude: { select: { strasse: true, hausnummer: true } } },
  });
  for (const z of zeilen) {
    if (!z.kostenartId) continue;
    if (findeDienstleister(z.empfaenger ?? "", z.verwendungszweck ?? "", [dienstleister])?.id !== dienstleister.id) continue;
    const texte = [z.verwendungszweck ?? "", z.gebaeude ? `${z.gebaeude.strasse} ${z.gebaeude.hausnummer}` : ""];
    if (texte.some((t) => [...adressSchluessel(t)].some((k) => adressen.has(k)))) ids.add(z.kostenartId);
  }
  return ids;
}

/**
 * Sichert die Kostenart einer Erkennung (und die ihrer Teile) ab: Wählt die Erkennung eine von mehreren gleichartigen Kostenarten
 * ihres Dienstleisters, gilt die Kostenart der bisherigen Buchungen an derselben Verbrauchsstelle, wenn es genau eine ist; sonst wird
 * nichts vorgeschlagen und der Hinweis nennt die Auswahl. Alles andere bleibt unverändert.
 */
export async function sichereKostenart<T extends ErkennungErgebnis>(e: T): Promise<T> {
  const einheiten: Erkennung[] = [e, ...(e.teile ?? [])];
  if (!einheiten.some((x) => x.kostenartId && x.aussteller)) return e;
  const dienstleister = await ladeDienstleister();
  const hinweise: string[] = [];
  for (const x of einheiten) {
    if (!x.kostenartId || !x.aussteller) continue;
    const dl = findeDienstleister(x.aussteller, "", dienstleister) as DienstleisterMitKostenarten | null;
    if (!dl) continue;
    const gleiche = gleichartigeKostenarten(x.kostenartId, dl.kostenarten);
    if (!gleiche) continue;
    const historie = await ladeHistorie(dl, gleiche, adressSchluessel(x.objekt ?? ""));
    if (historie.size === 1) {
      x.kostenartId = [...historie][0];
      continue;
    }
    x.kostenartId = null;
    hinweise.push(`Kostenart nicht eindeutig (${gleiche.map((k) => k.name).join(" / ")}) – bitte wählen`);
  }
  if (hinweise.length > 0) e.hinweis = [...new Set(hinweise)].join("; ") + (e.hinweis ? ` · ${e.hinweis}` : "");
  return e;
}
