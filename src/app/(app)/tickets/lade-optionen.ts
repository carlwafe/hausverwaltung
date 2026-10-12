import { prisma } from "@/lib/prisma";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { sortGebaeudeNachHaus } from "@/lib/sort-gebaeude";
import { mieterName } from "@/lib/mieter-name";
import { hausLabel, vergleicheHaus } from "@/lib/gebaeude-gruppen";

const STATUS_ZUSATZ = { AKTIV: "", BEENDET: " – beendet", GEPLANT: " – geplant" } as const;

type Option = { id: string; label: string };

/** Auswahllisten für das Ticket-Formular (Einheit, Mietvertrag, Gebäude, Dienstleister, Zuständige). */
export async function ladeTicketOptionen() {
  const [einheiten, mietvertraege, gebaeude, haeuser, dienstleister, benutzer] = await Promise.all([
    prisma.einheit.findMany({ include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } }),
    prisma.mietvertrag.findMany({
      include: { mieter: true, einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } } },
    }),
    prisma.gebaeude.findMany({ include: { haus: { include: { gebaeude: true } } } }),
    prisma.haus.findMany({ include: { gebaeude: true } }),
    prisma.dienstleister.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, name: true, email: true } }),
  ]);

  const einheitLabel = (e: { bezeichnung: string; gebaeude: { strasse: string; hausnummer: string } }) =>
    `${e.gebaeude.strasse} ${e.gebaeude.hausnummer} – ${e.bezeichnung}`;

  return {
    einheiten: sortEinheitenNachGebaeude(einheiten).map((e): Option => ({ id: e.id, label: einheitLabel(e) })),
    // Auch beendete/geplante Verträge (Tickets betreffen oft ausgezogene Mieter); je Einheit stehen laufende zuerst.
    mietvertraege: sortEinheitenNachGebaeude(
      [...mietvertraege].sort((a, b) => Number(b.status === "AKTIV") - Number(a.status === "AKTIV")).map((v) => ({ ...v, gebaeude: v.einheit.gebaeude, bezeichnung: v.einheit.bezeichnung }))).map(
      (v): Option & { einheitId: string } => ({
        id: v.id,
        einheitId: v.einheitId,
        label: `${einheitLabel(v.einheit)} (${v.mieter.map(mieterName).join(" & ") || "ohne Mieter"})${STATUS_ZUSATZ[v.status]}`,
      }),
    ),
    gebaeude: sortGebaeudeNachHaus(gebaeude).map((g): Option => ({ id: g.id, label: `${g.strasse} ${g.hausnummer}` })),
    haeuser: [...haeuser].sort(vergleicheHaus).map((h): Option => ({ id: h.id, label: hausLabel(h.gebaeude) })),
    dienstleister: dienstleister.map((d): Option => ({ id: d.id, label: d.name })),
    benutzer: benutzer.map((u): Option => ({ id: u.id, label: u.name ?? u.email })),
  };
}
