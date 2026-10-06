import { prisma } from "@/lib/prisma";
import { mieterName } from "@/lib/mieter-name";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { OHNE_ORDNER, type BereichKey } from "@/lib/dokumente-anzeige";

// Die Dokument-Tabelle hat bewusst keine eigene Ordnerstruktur: jedes Dokument hängt an genau
// einem Bezug (Mietvertrag, Einheit, Kostenbuchung, Dienstleister, Ticket) oder an keinem
// (= "Allgemein", dort gilt der freie Ordnername). Die Ordner der Seite /dokumente werden daraus
// abgeleitet — Bereich = oberste Ebene, Unterordner = das Bezugsobjekt (bzw. Jahr bei Kosten).

export type DokumentZeile = {
  id: string;
  dateiname: string;
  groesseBytes: number | null;
  belegDatum: Date | null;
  createdAt: Date;
  hochgeladenVon: string | null;
  bereich: BereichKey;
  /** Eindeutiger Schlüssel des Unterordners innerhalb des Bereichs (für die URL). */
  ordnerKey: string;
  /** Anzeigename des Unterordners. */
  ordnerLabel: string;
  /** Sortierrang des Unterordners (Einheiten-Reihenfolge des Objekts); sonst 0. */
  ordnerRang: number;
  /** Bezeichnung des Bezugs und Link zur Seite, auf der man das Dokument ersetzen/löschen kann. */
  bezugLabel: string;
  bezugHref: string | null;
  /** Seite, die nach dem Löschen/Ändern neu geladen wird. */
  revalidatePath: string;
};

const einheitLabel = (e: { bezeichnung: string; gebaeude: { strasse: string; hausnummer: string } }) =>
  `${e.gebaeude.strasse} ${e.gebaeude.hausnummer} – ${e.bezeichnung}`;

export async function ladeDokumente(): Promise<DokumentZeile[]> {
  const dokumente = await prisma.dokument.findMany({
    include: {
      mietvertrag: {
        include: { mieter: true, einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } } },
      },
      einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } },
      buchung: { select: { id: true, datum: true, jahr: true, empfaenger: true, kostenart: { select: { name: true } } } },
      dienstleister: { select: { id: true, name: true } },
      ticket: { select: { id: true, nummer: true, titel: true } },
    },
  });

  // Rang der Einheiten in der Haus-Reihenfolge des Objekts (siehe CLAUDE.md „Sortierung“).
  const einheitenRang = new Map<string, number>();
  const alleEinheiten = [
    ...dokumente.flatMap((d) => (d.mietvertrag ? [d.mietvertrag.einheit] : [])),
    ...dokumente.flatMap((d) => (d.einheit ? [d.einheit] : [])),
  ];
  sortEinheitenNachGebaeude([...new Map(alleEinheiten.map((e) => [e.id, e])).values()]).forEach((e, i) =>
    einheitenRang.set(e.id, i),
  );

  return dokumente.map((d): DokumentZeile => {
    const basis = {
      id: d.id,
      dateiname: d.dateiname,
      groesseBytes: d.groesseBytes,
      belegDatum: d.belegDatum,
      createdAt: d.createdAt,
      hochgeladenVon: d.hochgeladenVon,
    };

    if (d.mietvertrag) {
      const v = d.mietvertrag;
      const label = `${einheitLabel(v.einheit)} (${v.mieter.map(mieterName).join(" & ") || "ohne Mieter"})`;
      return {
        ...basis,
        bereich: "mietvertraege",
        ordnerKey: v.id,
        ordnerLabel: label,
        ordnerRang: einheitenRang.get(v.einheitId) ?? 0,
        bezugLabel: label,
        bezugHref: `/mietvertraege/${v.id}`,
        revalidatePath: `/mietvertraege/${v.id}`,
      };
    }
    if (d.einheit) {
      const label = einheitLabel(d.einheit);
      return {
        ...basis,
        bereich: "einheiten",
        ordnerKey: d.einheit.id,
        ordnerLabel: label,
        ordnerRang: einheitenRang.get(d.einheit.id) ?? 0,
        bezugLabel: label,
        bezugHref: `/einheiten/${d.einheit.id}`,
        revalidatePath: `/einheiten/${d.einheit.id}`,
      };
    }
    if (d.buchung) {
      const b = d.buchung;
      const jahr = b.datum?.getUTCFullYear() ?? b.jahr;
      return {
        ...basis,
        bereich: "kosten",
        ordnerKey: String(jahr ?? "ohne"),
        ordnerLabel: jahr ? String(jahr) : "Ohne Jahr",
        // Neueste Jahre zuerst.
        ordnerRang: -(jahr ?? 0),
        bezugLabel: [b.kostenart?.name, b.empfaenger].filter(Boolean).join(" – ") || "Kostenposition",
        bezugHref: `/kosten/${b.id}`,
        revalidatePath: `/kosten/${b.id}`,
      };
    }
    if (d.dienstleister) {
      return {
        ...basis,
        bereich: "dienstleister",
        ordnerKey: d.dienstleister.id,
        ordnerLabel: d.dienstleister.name,
        ordnerRang: 0,
        bezugLabel: d.dienstleister.name,
        bezugHref: `/dienstleister/${d.dienstleister.id}`,
        revalidatePath: `/dienstleister/${d.dienstleister.id}`,
      };
    }
    if (d.ticket) {
      const label = `#${d.ticket.nummer} ${d.ticket.titel}`;
      return {
        ...basis,
        bereich: "tickets",
        ordnerKey: d.ticket.id,
        ordnerLabel: label,
        // Neueste Tickets zuerst.
        ordnerRang: -d.ticket.nummer,
        bezugLabel: label,
        bezugHref: `/tickets/${d.ticket.id}`,
        revalidatePath: `/tickets/${d.ticket.id}`,
      };
    }
    const ordner = d.ordner?.trim() || OHNE_ORDNER;
    return {
      ...basis,
      bereich: "allgemein",
      ordnerKey: ordner,
      ordnerLabel: ordner,
      ordnerRang: 0,
      bezugLabel: "–",
      bezugHref: null,
      revalidatePath: "/dokumente",
    };
  });
}

export type OrdnerInfo = { key: string; label: string; anzahl: number; rang: number; groesse: number };

/** Unterordner eines Bereichs mit Anzahl/Größe, in sinnvoller Reihenfolge (Rang, dann Name). */
export function ordnerVonBereich(zeilen: DokumentZeile[], bereich: BereichKey): OrdnerInfo[] {
  const map = new Map<string, OrdnerInfo>();
  for (const z of zeilen) {
    if (z.bereich !== bereich) continue;
    const o = map.get(z.ordnerKey) ?? { key: z.ordnerKey, label: z.ordnerLabel, anzahl: 0, rang: z.ordnerRang, groesse: 0 };
    o.anzahl += 1;
    o.groesse += z.groesseBytes ?? 0;
    map.set(z.ordnerKey, o);
  }
  return [...map.values()].sort(
    (a, b) =>
      // „Ohne Ordner“ ans Ende, sonst Rang, dann Name.
      Number(a.label === OHNE_ORDNER) - Number(b.label === OHNE_ORDNER) ||
      a.rang - b.rang ||
      a.label.localeCompare(b.label, "de"),
  );
}

/** Vorhandene Ordnernamen im Bereich „Allgemein“ (für die Auswahl beim Upload). */
export function allgemeineOrdnerNamen(zeilen: DokumentZeile[]): string[] {
  return ordnerVonBereich(zeilen, "allgemein")
    .map((o) => o.label)
    .filter((n) => n !== OHNE_ORDNER);
}

export type BezugOption = { id: string; label: string };

/** Auswahllisten für den zentralen Upload („Ablegen bei“). */
export async function ladeBezugOptionen(): Promise<Record<Exclude<BereichKey, "allgemein" | "kosten">, BezugOption[]>> {
  const [einheiten, mietvertraege, dienstleister, tickets] = await Promise.all([
    prisma.einheit.findMany({ include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } }),
    prisma.mietvertrag.findMany({
      include: { mieter: true, einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } } },
    }),
    prisma.dienstleister.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ticket.findMany({ orderBy: { nummer: "desc" }, select: { id: true, nummer: true, titel: true } }),
  ]);

  return {
    mietvertraege: sortEinheitenNachGebaeude(
      mietvertraege.map((v) => ({ ...v, gebaeude: v.einheit.gebaeude, bezeichnung: v.einheit.bezeichnung })),
    ).map((v) => ({
      id: v.id,
      label: `${einheitLabel(v.einheit)} (${v.mieter.map(mieterName).join(" & ") || "ohne Mieter"})`,
    })),
    einheiten: sortEinheitenNachGebaeude(einheiten).map((e) => ({ id: e.id, label: einheitLabel(e) })),
    dienstleister: dienstleister.map((d) => ({ id: d.id, label: d.name })),
    tickets: tickets.map((t) => ({ id: t.id, label: `#${t.nummer} ${t.titel}` })),
  };
}
