import { prisma } from "@/lib/prisma";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { sortByStrasseUndHausnummer } from "@/lib/sort-gebaeude";
import { mieterName } from "@/lib/mieter-name";
import { hausLabel, vergleicheHaus } from "@/lib/gebaeude-gruppen";

type Option = { id: string; label: string };

/** Auswahllisten für das Ticket-Formular (Einheit, Mietvertrag, Gebäude, Dienstleister, Zuständige). */
export async function ladeTicketOptionen(aktuell?: { mietvertragId?: string | null }) {
  const [einheiten, mietvertraege, gebaeude, haeuser, dienstleister, benutzer] = await Promise.all([
    prisma.einheit.findMany({ include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } }),
    prisma.mietvertrag.findMany({
      where: { OR: [{ status: "AKTIV" }, ...(aktuell?.mietvertragId ? [{ id: aktuell.mietvertragId }] : [])] },
      include: { mieter: true, einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } } },
    }),
    prisma.gebaeude.findMany(),
    prisma.haus.findMany({ include: { gebaeude: true } }),
    prisma.dienstleister.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, name: true, email: true } }),
  ]);

  const einheitLabel = (e: { bezeichnung: string; gebaeude: { strasse: string; hausnummer: string } }) =>
    `${e.gebaeude.strasse} ${e.gebaeude.hausnummer} – ${e.bezeichnung}`;

  return {
    einheiten: sortEinheitenNachGebaeude(einheiten).map((e): Option => ({ id: e.id, label: einheitLabel(e) })),
    mietvertraege: sortEinheitenNachGebaeude(mietvertraege.map((v) => ({ ...v, gebaeude: v.einheit.gebaeude, bezeichnung: v.einheit.bezeichnung }))).map(
      (v): Option & { einheitId: string } => ({
        id: v.id,
        einheitId: v.einheitId,
        label: `${einheitLabel(v.einheit)} (${v.mieter.map(mieterName).join(" & ") || "ohne Mieter"})`,
      }),
    ),
    gebaeude: sortByStrasseUndHausnummer(gebaeude).map((g): Option => ({ id: g.id, label: `${g.strasse} ${g.hausnummer}` })),
    haeuser: [...haeuser].sort(vergleicheHaus).map((h): Option => ({ id: h.id, label: hausLabel(h.gebaeude) })),
    dienstleister: dienstleister.map((d): Option => ({ id: d.id, label: d.name })),
    benutzer: benutzer.map((u): Option => ({ id: u.id, label: u.name ?? u.email })),
  };
}
