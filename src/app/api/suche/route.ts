import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { sichtbareTickets, sichtbareTicketDokumente } from "@/lib/ticket";
import { mieterName } from "@/lib/mieter-name";
import type { SuchGruppe } from "@/lib/suche-typen";

// Globale Suche der Startseite. Bewusst schlank (docs/deployment-vercel.md): erst ab 2 Zeichen, je Gruppe
// höchstens LIMIT Treffer, nur die Spalten, die die Trefferzeile braucht (nie `rohdaten`), alle Abfragen
// parallel in einer Verbindung. Jedes Wort der Eingabe muss in irgendeinem Feld des Treffers vorkommen.
const LIMIT = 6;

const enthaelt = (wort: string) => ({ contains: wort, mode: "insensitive" as const });

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const woerter = q.split(/\s+/).filter(Boolean).slice(0, 4);
  if (q.length < 2 || woerter.length === 0) return NextResponse.json({ gruppen: [] satisfies SuchGruppe[] });

  const alleWoerter = <T,>(feld: (w: string) => T): { AND: T[] } => ({ AND: woerter.map(feld) });
  const grossesText = q.length >= 3;

  const [mieter, vertraege, einheiten, dienstleister, tickets, dokumente, buchungen] = await Promise.all([
    prisma.mieter.findMany({
      where: alleWoerter((w): Prisma.MieterWhereInput => ({
        OR: [
          { vorname: enthaelt(w) },
          { nachname: enthaelt(w) },
          { email: enthaelt(w) },
          { handynummer: enthaelt(w) },
          { festnetznummer: enthaelt(w) },
        ],
      })),
      select: { id: true, vorname: true, nachname: true, mietvertraege: { select: { status: true, einheit: { select: { bezeichnung: true, gebaeude: { select: { strasse: true, hausnummer: true } } } } }, take: 3 } },
      orderBy: { nachname: "asc" },
      take: LIMIT,
    }),
    prisma.mietvertrag.findMany({
      where: alleWoerter((w): Prisma.MietvertragWhereInput => ({
        OR: [
          { mieter: { some: { OR: [{ vorname: enthaelt(w) }, { nachname: enthaelt(w) }] } } },
          { einheit: { bezeichnung: enthaelt(w) } },
          { einheit: { gebaeude: { OR: [{ strasse: enthaelt(w) }, { hausnummer: enthaelt(w) }] } } },
          { notiz: enthaelt(w) },
        ],
      })),
      select: {
        id: true,
        status: true,
        mieter: { select: { vorname: true, nachname: true } },
        einheit: { select: { bezeichnung: true, gebaeude: { select: { strasse: true, hausnummer: true } } } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: LIMIT,
    }),
    prisma.einheit.findMany({
      where: alleWoerter((w): Prisma.EinheitWhereInput => ({
        OR: [
          { bezeichnung: enthaelt(w) },
          { gebaeude: { OR: [{ strasse: enthaelt(w) }, { hausnummer: enthaelt(w) }] } },
        ],
      })),
      select: { id: true, bezeichnung: true, gebaeude: { select: { strasse: true, hausnummer: true } } },
      take: LIMIT,
    }),
    prisma.dienstleister.findMany({
      where: alleWoerter((w): Prisma.DienstleisterWhereInput => ({
        OR: [{ name: enthaelt(w) }, { beschreibung: enthaelt(w) }, { ansprechpartner: enthaelt(w) }],
      })),
      select: { id: true, name: true, beschreibung: true },
      orderBy: { name: "asc" },
      take: LIMIT,
    }),
    prisma.ticket.findMany({
      where: {
        ...sichtbareTickets(user.id),
        ...alleWoerter((w): Prisma.TicketWhereInput => ({
          OR: [
            { titel: enthaelt(w) },
            { beschreibung: enthaelt(w) },
            ...(/^#?\d{1,6}$/.test(w) ? [{ nummer: Number(w.replace("#", "")) }] : []),
          ],
        })),
      },
      select: { id: true, nummer: true, titel: true, status: true },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    grossesText
      ? prisma.dokument.findMany({
          where: { ...sichtbareTicketDokumente(user.id), ...alleWoerter((w): Prisma.DokumentWhereInput => ({ dateiname: enthaelt(w) })) },
          select: { id: true, dateiname: true },
          orderBy: { createdAt: "desc" },
          take: LIMIT,
        })
      : [],
    grossesText
      ? prisma.buchung.findMany({
          where: {
            ...AKTIVE_BUCHUNG_FILTER,
            ...alleWoerter((w): Prisma.BuchungWhereInput => ({
              OR: [{ empfaenger: enthaelt(w) }, { verwendungszweck: enthaelt(w) }, { bemerkung: enthaelt(w) }],
            })),
          },
          select: {
            id: true,
            datum: true,
            betrag: true,
            empfaenger: true,
            verwendungszweck: true,
            buchungsart: { select: { code: true, bezeichnung: true } },
          },
          orderBy: { datum: { sort: "desc", nulls: "last" } },
          take: LIMIT,
        })
      : [],
  ]);

  const adresse = (e: { bezeichnung: string; gebaeude: { strasse: string; hausnummer: string } }) =>
    `${e.gebaeude.strasse} ${e.gebaeude.hausnummer} — ${e.bezeichnung}`;
  const datumDe = (d: Date | null) => (d ? d.toLocaleDateString("de-DE", { timeZone: "UTC" }) : "ohne Datum");
  const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const gruppen: SuchGruppe[] = [
    {
      titel: "Mietverträge",
      treffer: vertraege.map((v) => ({
        href: `/mietvertraege/${v.id}`,
        titel: v.mieter.map(mieterName).join(", ") || "(ohne Mieter)",
        zusatz: adresse(v.einheit),
        marke: v.status === "AKTIV" ? null : "beendet",
      })),
    },
    {
      titel: "Mieter",
      treffer: mieter.map((m) => ({
        href: `/mieter/${m.id}`,
        titel: mieterName(m),
        zusatz: m.mietvertraege.map((v) => adresse(v.einheit)).join(" · ") || "ohne Mietvertrag",
        marke: null,
      })),
    },
    {
      titel: "Einheiten",
      treffer: einheiten.map((e) => ({ href: `/einheiten/${e.id}`, titel: adresse(e), zusatz: "", marke: null })),
    },
    {
      titel: "Dienstleister",
      treffer: dienstleister.map((d) => ({ href: `/dienstleister/${d.id}`, titel: d.name, zusatz: d.beschreibung ?? "", marke: null })),
    },
    {
      titel: "Tickets",
      treffer: tickets.map((t) => ({
        href: `/tickets/${t.id}`,
        titel: `#${t.nummer} ${t.titel}`,
        zusatz: "",
        marke: t.status === "ERLEDIGT" ? "erledigt" : null,
      })),
    },
    {
      titel: "Dokumente",
      treffer: dokumente.map((d) => ({ href: `/dokumente/${d.id}`, titel: d.dateiname, zusatz: "", marke: null })),
    },
    {
      titel: "Buchungen",
      treffer: buchungen.map((b) => ({
        href: b.buchungsart.code === "KOSTENPOSITION"
          ? `/kosten/${b.id}`
          : b.buchungsart.code.startsWith("KAUTION_")
            ? `/kautionen/buchung/${b.id}`
            : `/zahlungen/${b.id}`,
        titel: `${datumDe(b.datum)} · ${euro(Number(b.betrag))} · ${b.empfaenger ?? b.buchungsart.bezeichnung}`,
        zusatz: b.verwendungszweck ?? "",
        marke: null,
      })),
    },
  ].filter((g) => g.treffer.length > 0);

  return NextResponse.json({ gruppen });
}
