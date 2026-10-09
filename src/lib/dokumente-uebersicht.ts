import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { mieterName } from "@/lib/mieter-name";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { sortGebaeudeNachHaus } from "@/lib/sort-gebaeude";
import { OHNE_ORDNER, type BereichKey } from "@/lib/dokumente-anzeige";

// Die Dokument-Tabelle hat bewusst keine eigene Ordnerstruktur: ein Dokument kann mehrere Bezüge haben
// (Kostenposition, Mietvertrag, Einheit, Gebäude, Dienstleister, Ticket) oder keinen (= „Unkategorisiert“,
// dort gilt der freie Ordnername; „Eingang“, solange es noch nicht abgelegt ist). Die Bereiche der Seite
// /dokumente sind Ansichten darauf: ein Dokument erscheint in jedem Bereich, zu dem es einen Bezug hat;
// Unterordner = das Bezugsobjekt (bzw. das Jahr bei Kosten).

/** Bereiche, die einen Bezug zu einem Objekt der App bedeuten (also alle außer Eingang/Unkategorisiert). */
export type BezugTyp = Exclude<BereichKey, "eingang" | "allgemein">;

export type Bezug = {
  typ: BezugTyp;
  /** ID des Bezugsobjekts (bei Kosten die ID der Kostenposition). */
  id: string;
  label: string;
  href: string;
  /** Schlüssel des Unterordners in der Bereichsansicht (ID des Objekts; bei Kosten das Kostenjahr). */
  ordnerKey: string;
  ordnerLabel: string;
  ordnerRang: number;
  /** Nur Mieterakten: Status des Mietvertrags (für „beendet“-Kennzeichnung und Filter). */
  vertragStatus: "AKTIV" | "GEPLANT" | "BEENDET" | null;
};

export type DokumentZeile = {
  id: string;
  detailHref: string;
  /** Dokumentart (Schlüssel, siehe ART_OPTIONEN) oder null. */
  art: string | null;
  titel: string | null;
  dateiname: string;
  groesseBytes: number | null;
  belegDatum: Date | null;
  createdAt: Date;
  hochgeladenVon: string | null;
  /** Labels (Rechnungsangaben), soweit erfasst oder erkannt. */
  aussteller: string | null;
  rechnungsnummer: string | null;
  betrag: number | null;
  /** Kostenbelege (Bezug zu einer Kostenposition) lassen sich nicht löschen, nur ausblenden. */
  hatBuchung: boolean;
  /** Alle Bezüge des Dokuments (für die Spalte „Zugeordnet zu“). */
  bezuege: Bezug[];
  /** Bereich/Ordner, unter dem diese Zeile in der gewählten Ansicht steht. */
  bereich: BereichKey;
  ordnerKey: string;
  ordnerLabel: string;
  ordnerRang: number;
  /** Nur Mieterakten: Status des Mietvertrags dieses Ordners, sonst null. */
  vertragStatus: Bezug["vertragStatus"];
};

const einheitLabel = (e: { bezeichnung: string; gebaeude: { strasse: string; hausnummer: string } }) =>
  `${e.gebaeude.strasse} ${e.gebaeude.hausnummer} – ${e.bezeichnung}`;

/** Filter für `ladeDokumente`: nur ein Bereich bzw. ein Ordner davon (Ordnerschlüssel = ID des Bezugs) bzw. eine Art. */
export type DokumentFilter = { bereich?: BereichKey; ordnerKey?: string; art?: string };

function filterWhere(f: DokumentFilter): Prisma.DokumentWhereInput {
  const k = f.ordnerKey;
  const bereich: Prisma.DokumentWhereInput = (() => {
    switch (f.bereich) {
      case "mietvertraege":
        return { mietvertragId: k ?? { not: null } };
      case "einheiten":
        return { einheitId: k ?? { not: null } };
      case "gebaeude":
        return { gebaeudeId: k ?? { not: null } };
      case "kosten":
        return { buchungId: { not: null } };
      case "dienstleister":
        return { dienstleisterId: k ?? { not: null } };
      case "tickets":
        return { ticketId: k ?? { not: null } };
      case "eingang":
        return { eingang: true };
      case "allgemein":
        return { mietvertragId: null, einheitId: null, gebaeudeId: null, buchungId: null, dienstleisterId: null, ticketId: null, eingang: false };
      default:
        return {};
    }
  })();
  return { ...bereich, ...(f.art === "_ohne" ? { art: null } : f.art ? { art: f.art } : {}) };
}

const GEBAEUDE_MIT_HAUS = { include: { haus: { include: { gebaeude: true } } } } as const;

async function ladeDokumenteAusTabelle(filter?: DokumentFilter, einzelneId?: string): Promise<DokumentZeile[]> {
  const dokumente = await prisma.dokument.findMany({
    // Ausgeblendete Kostenbelege (Löschsperre) tauchen in der Ablage nicht auf, nur auf ihrer Detailseite.
    where: einzelneId ? { id: einzelneId } : { ausgeblendetAm: null, ...(filter ? filterWhere(filter) : {}) },
    include: {
      mietvertrag: { include: { mieter: true, einheit: { include: { gebaeude: GEBAEUDE_MIT_HAUS } } } },
      einheit: { include: { gebaeude: GEBAEUDE_MIT_HAUS } },
      gebaeude: GEBAEUDE_MIT_HAUS,
      buchung: { select: { id: true, datum: true, jahr: true, empfaenger: true, kostenart: { select: { name: true } } } },
      dienstleister: { select: { id: true, name: true } },
      ticket: { select: { id: true, nummer: true, titel: true } },
    },
  });

  // Rang der Einheiten und Gebäude in der Haus-Reihenfolge des Objekts (siehe CLAUDE.md „Sortierung“).
  const einheitenRang = new Map<string, number>();
  const alleEinheiten = [
    ...dokumente.flatMap((d) => (d.mietvertrag ? [d.mietvertrag.einheit] : [])),
    ...dokumente.flatMap((d) => (d.einheit ? [d.einheit] : [])),
  ];
  sortEinheitenNachGebaeude([...new Map(alleEinheiten.map((e) => [e.id, e])).values()]).forEach((e, i) =>
    einheitenRang.set(e.id, i),
  );
  const gebaeudeRang = new Map<string, number>();
  const alleGebaeude = dokumente.flatMap((d) => (d.gebaeude ? [d.gebaeude] : []));
  sortGebaeudeNachHaus([...new Map(alleGebaeude.map((g) => [g.id, g])).values()]).forEach((g, i) => gebaeudeRang.set(g.id, i));

  return dokumente.flatMap((d): DokumentZeile[] => {
    const bezuege: Bezug[] = [];
    if (d.mietvertrag) {
      const v = d.mietvertrag;
      const label = `${einheitLabel(v.einheit)} (${v.mieter.map(mieterName).join(" & ") || "ohne Mieter"})`;
      bezuege.push({
        typ: "mietvertraege", id: v.id, label, href: `/mietvertraege/${v.id}`, ordnerKey: v.id, ordnerLabel: label,
        ordnerRang: einheitenRang.get(v.einheitId) ?? 0, vertragStatus: v.status,
      });
    }
    if (d.einheit) {
      const label = einheitLabel(d.einheit);
      bezuege.push({
        typ: "einheiten", id: d.einheit.id, label, href: `/einheiten/${d.einheit.id}`, ordnerKey: d.einheit.id,
        ordnerLabel: label, ordnerRang: einheitenRang.get(d.einheit.id) ?? 0, vertragStatus: null,
      });
    }
    if (d.gebaeude) {
      const label = `${d.gebaeude.strasse} ${d.gebaeude.hausnummer}`;
      bezuege.push({
        typ: "gebaeude", id: d.gebaeude.id, label, href: `/gebaeude/${d.gebaeude.id}`, ordnerKey: d.gebaeude.id,
        ordnerLabel: label, ordnerRang: gebaeudeRang.get(d.gebaeude.id) ?? 0, vertragStatus: null,
      });
    }
    if (d.buchung) {
      const b = d.buchung;
      const jahr = b.datum?.getUTCFullYear() ?? b.jahr;
      bezuege.push({
        typ: "kosten", id: b.id, label: [b.kostenart?.name, b.empfaenger].filter(Boolean).join(" – ") || "Kostenposition",
        href: `/kosten/${b.id}`, ordnerKey: String(jahr ?? "ohne"), ordnerLabel: jahr ? String(jahr) : "Ohne Jahr",
        // Neueste Jahre zuerst.
        ordnerRang: -(jahr ?? 0), vertragStatus: null,
      });
    }
    if (d.dienstleister) {
      bezuege.push({
        typ: "dienstleister", id: d.dienstleister.id, label: d.dienstleister.name, href: `/dienstleister/${d.dienstleister.id}`,
        ordnerKey: d.dienstleister.id, ordnerLabel: d.dienstleister.name, ordnerRang: 0, vertragStatus: null,
      });
    }
    if (d.ticket) {
      const label = `#${d.ticket.nummer} ${d.ticket.titel}`;
      bezuege.push({
        typ: "tickets", id: d.ticket.id, label, href: `/tickets/${d.ticket.id}`, ordnerKey: d.ticket.id, ordnerLabel: label,
        // Neueste Tickets zuerst.
        ordnerRang: -d.ticket.nummer, vertragStatus: null,
      });
    }

    const basis = {
      id: d.id,
      detailHref: `/dokumente/${d.id}`,
      art: d.art,
      titel: d.titel,
      dateiname: d.dateiname,
      groesseBytes: d.groesseBytes,
      belegDatum: d.belegDatum,
      createdAt: d.createdAt,
      hochgeladenVon: d.hochgeladenVon,
      aussteller: d.aussteller,
      rechnungsnummer: d.rechnungsnummer,
      betrag: d.betrag === null ? null : Number(d.betrag),
      hatBuchung: d.buchungId !== null,
      bezuege,
    };
    const zeile = (bereich: BereichKey, o: { ordnerKey: string; ordnerLabel: string; ordnerRang: number; vertragStatus: Bezug["vertragStatus"] }): DokumentZeile => ({
      ...basis,
      bereich,
      ordnerKey: o.ordnerKey,
      ordnerLabel: o.ordnerLabel,
      ordnerRang: o.ordnerRang,
      vertragStatus: o.vertragStatus,
    });

    // Ohne Bezug: Eingang oder Unkategorisiert (mit frei benanntem Ordner).
    if (bezuege.length === 0) {
      if (d.eingang) return [zeile("eingang", { ordnerKey: "eingang", ordnerLabel: "Eingang", ordnerRang: 0, vertragStatus: null })];
      const ordner = d.ordner?.trim() || OHNE_ORDNER;
      return [zeile("allgemein", { ordnerKey: ordner, ordnerLabel: ordner, ordnerRang: 0, vertragStatus: null })];
    }
    // Bereichsansicht: eine Zeile je passendem Bezug (ein Dokument erscheint in jedem Bereich, zu dem es gehört).
    if (filter?.bereich) {
      return bezuege.filter((b) => b.typ === filter.bereich).map((b) => zeile(b.typ, b));
    }
    // Gesamtansicht und Einzelansicht: eine Zeile, der erste Bezug gibt den Bereich an.
    return [zeile(bezuege[0].typ, bezuege[0])];
  });
}

// Die Kontoauszug-Originale stehen bewusst nicht hier, sondern nur unter Kontoauszug → Importe.
// Ohne Filter alle Dokumente (Ansicht „Alle Dokumente“), sonst nur Bereich bzw. Ordner bzw. Art.
export async function ladeDokumente(filter?: DokumentFilter): Promise<DokumentZeile[]> {
  return ladeDokumenteAusTabelle(filter);
}

/** Eine Zeile samt Bezügen (für die Detailseite); auch ausgeblendete Dokumente. */
export async function ladeDokumentZeile(id: string): Promise<DokumentZeile | null> {
  return (await ladeDokumenteAusTabelle(undefined, id))[0] ?? null;
}

/** Schlanker Eintrag je Dokument für die Übersicht (Zählungen, Ordnernamen) — ohne Bezugsobjekte. */
export type DokumentIndexEintrag = {
  /** Alle Bereiche, in denen das Dokument erscheint (bei mehreren Bezügen mehrere). */
  bereiche: BereichKey[];
  art: string | null;
  groesseBytes: number | null;
  ordner: string | null;
};

/**
 * Lädt nur die Spalten, die die Ordnerübersicht braucht (eine Abfrage ohne Includes). Die schweren
 * Zeilen mit Mietvertrag/Einheit/Gebäude holt `ladeDokumente` erst, wenn ein Bereich oder Ordner
 * geöffnet wird (Vercel-CPU, siehe CLAUDE.md).
 */
export async function ladeDokumentIndex(): Promise<DokumentIndexEintrag[]> {
  const dokumente = await prisma.dokument.findMany({
    where: { ausgeblendetAm: null },
    select: {
      art: true,
      groesseBytes: true,
      ordner: true,
      mietvertragId: true,
      einheitId: true,
      gebaeudeId: true,
      buchungId: true,
      dienstleisterId: true,
      ticketId: true,
      eingang: true,
    },
  });
  return dokumente.map((d) => {
    const bereiche: BereichKey[] = [];
    if (d.mietvertragId) bereiche.push("mietvertraege");
    if (d.einheitId) bereiche.push("einheiten");
    if (d.gebaeudeId) bereiche.push("gebaeude");
    if (d.buchungId) bereiche.push("kosten");
    if (d.dienstleisterId) bereiche.push("dienstleister");
    if (d.ticketId) bereiche.push("tickets");
    if (bereiche.length === 0) bereiche.push(d.eingang ? "eingang" : "allgemein");
    return { bereiche, art: d.art, groesseBytes: d.groesseBytes, ordner: d.ordner?.trim() || null };
  });
}

export type OrdnerInfo = {
  key: string;
  label: string;
  anzahl: number;
  rang: number;
  groesse: number;
  /** Nur Mieterakten: Status des Mietvertrags. */
  vertragStatus: DokumentZeile["vertragStatus"];
};

/** Unterordner eines Bereichs mit Anzahl/Größe, in sinnvoller Reihenfolge (Rang, dann Name). */
export function ordnerVonBereich(zeilen: DokumentZeile[], bereich: BereichKey): OrdnerInfo[] {
  const map = new Map<string, OrdnerInfo>();
  for (const z of zeilen) {
    if (z.bereich !== bereich) continue;
    const o = map.get(z.ordnerKey) ?? {
      key: z.ordnerKey,
      label: z.ordnerLabel,
      anzahl: 0,
      rang: z.ordnerRang,
      groesse: 0,
      vertragStatus: z.vertragStatus,
    };
    o.anzahl += 1;
    o.groesse += z.groesseBytes ?? 0;
    map.set(z.ordnerKey, o);
  }
  return [...map.values()].sort(
    (a, b) =>
      // „Ohne Ordner“ ans Ende, beendete Mietverträge hinter die laufenden, sonst Rang, dann Name.
      Number(a.label === OHNE_ORDNER) - Number(b.label === OHNE_ORDNER) ||
      Number(a.vertragStatus === "BEENDET") - Number(b.vertragStatus === "BEENDET") ||
      a.rang - b.rang ||
      a.label.localeCompare(b.label, "de"),
  );
}

/** Vorhandene Ordnernamen im Bereich „Unkategorisiert“ (für die Auswahl beim Upload), alphabetisch. */
export function allgemeineOrdnerNamen(index: DokumentIndexEintrag[]): string[] {
  const namen = new Set<string>();
  for (const e of index) if (e.bereiche.includes("allgemein") && e.ordner) namen.add(e.ordner);
  return [...namen].sort((a, b) => a.localeCompare(b, "de"));
}

export type BezugOption = { id: string; label: string };

/** Auswahllisten für „Bezug hinzufügen“ (ohne Kostenpositionen — die hängen vom Dokument ab, siehe dokument-zuordnung.ts). */
export async function ladeBezugOptionen(): Promise<Record<Exclude<BezugTyp, "kosten">, BezugOption[]>> {
  const [einheiten, gebaeude, mietvertraege, dienstleister, tickets] = await Promise.all([
    prisma.einheit.findMany({ include: { gebaeude: GEBAEUDE_MIT_HAUS } }),
    prisma.gebaeude.findMany({ include: { haus: { include: { gebaeude: true } } } }),
    prisma.mietvertrag.findMany({
      include: { mieter: true, einheit: { include: { gebaeude: GEBAEUDE_MIT_HAUS } } },
    }),
    prisma.dienstleister.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ticket.findMany({ orderBy: { nummer: "desc" }, select: { id: true, nummer: true, titel: true } }),
  ]);

  return {
    mietvertraege: sortEinheitenNachGebaeude(
      mietvertraege.map((v) => ({ ...v, gebaeude: v.einheit.gebaeude, bezeichnung: v.einheit.bezeichnung })),
    ).map((v) => ({
      id: v.id,
      label: `${einheitLabel(v.einheit)} (${v.mieter.map(mieterName).join(" & ") || "ohne Mieter"})${v.status === "BEENDET" ? " – beendet" : ""}`,
    })),
    einheiten: sortEinheitenNachGebaeude(einheiten).map((e) => ({ id: e.id, label: einheitLabel(e) })),
    gebaeude: sortGebaeudeNachHaus(gebaeude).map((g) => ({ id: g.id, label: `${g.strasse} ${g.hausnummer}` })),
    dienstleister: dienstleister.map((d) => ({ id: d.id, label: d.name })),
    tickets: tickets.map((t) => ({ id: t.id, label: `#${t.nummer} ${t.titel}` })),
  };
}
