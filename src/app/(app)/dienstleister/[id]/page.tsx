import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DienstleisterForm } from "../dienstleister-form";
import { updateDienstleister, deleteDienstleister } from "../actions";
import { ladeKostenartenOptionen } from "../lade-optionen";
import { uploadDokument } from "../../dokumente/actions";
import { BelegeSektion } from "@/components/belege-sektion";
import { MAX_DOKUMENT_GROESSE_BYTES } from "@/lib/upload-limits";
import { DeleteButton } from "@/components/delete-button";
import { TicketsSektion } from "../../tickets/tickets-sektion";

export default async function DienstleisterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dienstleister, kostenarten] = await Promise.all([
    prisma.dienstleister.findUnique({
      where: { id },
      include: { kostenarten: { select: { id: true } }, dokumente: { where: { buchungId: null } } },
    }),
    ladeKostenartenOptionen(),
  ]);
  if (!dienstleister) notFound();

  const kontakte = [
    dienstleister.telefon && { art: "Telefon", label: dienstleister.telefon, href: telefonHref(dienstleister.telefon) },
    dienstleister.email && { art: "E-Mail", label: dienstleister.email, href: `mailto:${dienstleister.email}` },
  ].filter((k): k is { art: string; label: string; href: string } => Boolean(k));

  return (
    <div>
      <div className="mb-6">
        <Link href="/dienstleister" className="text-sm text-neutral-400 hover:text-white hover:underline">
          ← Alle Dienstleister
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{dienstleister.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              dienstleister.aktiv ? "bg-green-500/10 text-green-400" : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {dienstleister.aktiv ? "Aktiv" : "Inaktiv"}
          </span>
          <span>{dienstleister.typ === "HANDWERKER" ? "Handwerker" : "Sonstiger Dienstleister"}</span>
          {dienstleister.beschreibung && (
            <>
              <span aria-hidden="true">·</span>
              <span>{dienstleister.beschreibung}</span>
            </>
          )}
          {dienstleister.ansprechpartner && (
            <>
              <span aria-hidden="true">·</span>
              <span>Ansprechpartner: {dienstleister.ansprechpartner}</span>
            </>
          )}
        </p>
        {kontakte.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {kontakte.map((k) => (
              <a
                key={k.art}
                href={k.href}
                title={`${k.art}: ${k.label}`}
                className="inline-flex h-10 max-w-full items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-white hover:bg-neutral-900"
              >
                <span className="text-xs text-neutral-400">{k.art}</span>
                <span className="truncate">{k.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <DienstleisterForm
        initial={{ ...dienstleister, kostenartIds: dienstleister.kostenarten.map((k) => k.id) }}
        kostenarten={kostenarten}
        action={updateDienstleister.bind(null, id)}
        abbrechenHref="/dienstleister"
      />

      {/* Am breiten Bildschirm Verträge und Tickets nebeneinander. */}
      <div className="mt-10 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <BelegeSektion
          titel="Verträge"
          maxBytes={MAX_DOKUMENT_GROESSE_BYTES}
          leerText="Noch kein Vertrag hochgeladen."
          dokumente={dienstleister.dokumente}
          uploadAction={uploadDokument.bind(null, {
            dienstleisterId: id,
            revalidatePath: `/dienstleister/${id}`,
          })}
          revalidatePath={`/dienstleister/${id}`}
        />
        <TicketsSektion where={{ dienstleisterId: id }} neuQuery={{ dienstleisterId: id }} />
      </div>

      <section className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/60 p-4">
        <div>
          <h2 className="text-sm font-medium text-white">Dienstleister löschen</h2>
          <p className="text-xs text-neutral-400">
            Hochgeladene Verträge werden mitgelöscht, Tickets verlieren nur die Zuordnung; importierte Buchungen bleiben
            unverändert. Nach einem Wechsel besser auf „inaktiv“ setzen.
          </p>
        </div>
        <DeleteButton
          action={deleteDienstleister.bind(null, id)}
          confirmText={`${dienstleister.name} wirklich löschen? Hochgeladene Verträge werden mitgelöscht.`}
          label="Dienstleister löschen"
        />
      </section>
    </div>
  );
}

// tel:-Link aus einer Telefonangabe, die auch Zusätze enthalten kann („04521 … (Notdienst)“).
function telefonHref(nummer: string) {
  const ziffern = nummer.split(/[a-zA-Z(,;/]/)[0].replace(/[^\d+]/g, "");
  return `tel:${ziffern}`;
}
