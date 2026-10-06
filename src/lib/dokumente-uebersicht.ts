import { prisma } from "@/lib/prisma";
import { mieterName } from "@/lib/mieter-name";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { ART_KONTOAUSZUG, OHNE_ORDNER, jahrAusDateiname, type BereichKey } from "@/lib/dokumente-anzeige";

// Die Dokument-Tabelle hat bewusst keine eigene Ordnerstruktur: jedes Dokument hängt an genau
// einem Bezug (Mietvertrag, Einheit, Kostenbuchung, Dienstleister, Ticket) oder an keinem
// (= "Unkategorisiert", dort gilt der freie Ordnername). Die Ordner der Seite /dokumente werden daraus
// abgeleitet — Bereich = oberste Ebene, Unterordner = das Bezugsobjekt (bzw. Jahr bei Kosten).

export type DokumentZeile = {
  id: string;
  /** Kontoauszug-Dateien (aus den Importen) sind nur zum Ansehen: nicht änderbar, nicht löschbar. */
  schreibgeschuetzt: boolean;
  downloadHref: string;
  /** Nur Mieterakten: Status des Mietvertrags (für „beendet“-Kennzeichnung und Filter), sonst null. */
  vertragStatus: "AKTIV" | "GEPLANT" | "BEENDET" | null;
  /** Dokumentart (Schlüssel, siehe ART_OPTIONEN) oder null. */
  art: string | null;
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

async function ladeDokumenteAusTabelle(): Promise<DokumentZeile[]> {
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
      schreibgeschuetzt: false,
      downloadHref: `/api/dokumente/${d.id}/download`,
      art: d.art,
      vertragStatus: null as DokumentZeile["vertragStatus"],
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
        vertragStatus: v.status,
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

// Originaldateien der Kontoauszug-Importe (ImportBatch.speicherpfad), je Datei die neueste — wie
// die Tabelle auf /kontoauszug/importe; nur Importe mit übernommenen oder geparkten Buchungen
// (reine Vorschauen zählen nicht). Nur zum Ansehen, Verwaltung bleibt unter Kontoauszug → Importe.
async function ladeKontoauszugDateien(): Promise<DokumentZeile[]> {
  const batches = await prisma.importBatch.findMany({
    where: {
      typ: "KONTOAUSZUG",
      speicherpfad: { not: null },
      OR: [{ buchungen: { some: {} } }, { nichtZugeordneteBuchungen: { some: {} } }],
    },
    orderBy: { erstelltAm: "desc" },
    select: { id: true, dateiname: true, erstelltAm: true, user: { select: { email: true, name: true } } },
  });

  const proDatei = new Map<string, (typeof batches)[number]>();
  for (const b of batches) if (!proDatei.has(b.dateiname)) proDatei.set(b.dateiname, b);

  return [...proDatei.values()].map((b): DokumentZeile => {
    const jahr = jahrAusDateiname(b.dateiname);
    return {
      id: `import-${b.id}`,
      schreibgeschuetzt: true,
      downloadHref: `/api/import-batches/${b.id}/download`,
      art: ART_KONTOAUSZUG,
      vertragStatus: null,
      dateiname: b.dateiname,
      groesseBytes: null,
      belegDatum: null,
      createdAt: b.erstelltAm,
      hochgeladenVon: b.user.email ?? b.user.name ?? null,
      bereich: "kontoauszuege",
      ordnerKey: jahr || "ohne",
      ordnerLabel: jahr || "Ohne Jahr",
      // Neueste Jahre zuerst, „Ohne Jahr“ ans Ende.
      ordnerRang: jahr ? -Number(jahr) : 0,
      bezugLabel: "Kontoauszug-Import",
      bezugHref: "/kontoauszug/importe",
      revalidatePath: "/kontoauszug/importe",
    };
  });
}

export async function ladeDokumente(): Promise<DokumentZeile[]> {
  const [ausTabelle, kontoauszuege] = await Promise.all([ladeDokumenteAusTabelle(), ladeKontoauszugDateien()]);
  return [...ausTabelle, ...kontoauszuege];
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

/** Vorhandene Ordnernamen im Bereich „Unkategorisiert“ (für die Auswahl beim Upload). */
export function allgemeineOrdnerNamen(zeilen: DokumentZeile[]): string[] {
  return ordnerVonBereich(zeilen, "allgemein")
    .map((o) => o.label)
    .filter((n) => n !== OHNE_ORDNER);
}

export type BezugOption = { id: string; label: string };

/** Auswahllisten für den zentralen Upload („Ablegen bei“). */
export async function ladeBezugOptionen(): Promise<Record<Exclude<BereichKey, "allgemein" | "kosten" | "kontoauszuege">, BezugOption[]>> {
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
