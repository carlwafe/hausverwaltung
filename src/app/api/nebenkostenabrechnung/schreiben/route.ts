import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { ladeNkSchreiben, nkSchreibenAlsPdf } from "@/lib/nk-schreiben-laden";

// PDF der Betriebskostenabrechnung als Schreiben an den Mieter (eines oder alle). Nur lesend, rechnet nur auf
// Knopfdruck; auch für Gäste (wie Jahresjournal und Aufstellung). Parameter: abrechnung (Id), mietvertrag
// (optional, Id oder kommagetrennt; ohne = alle Positionen), datum, frist (JJJJ-MM-TT; frist leer = ohne Termin).
function datumParam(wert: string | null): Date | null {
  if (!wert || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return null;
  const d = new Date(`${wert}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  await requireUser();
  const url = new URL(req.url);
  const abrechnungId = url.searchParams.get("abrechnung");
  const datum = datumParam(url.searchParams.get("datum"));
  if (!abrechnungId || !datum) return NextResponse.json({ error: "abrechnung und datum (JJJJ-MM-TT) sind nötig." }, { status: 400 });
  const frist = datumParam(url.searchParams.get("frist"));
  const ids = url.searchParams.get("mietvertrag")?.split(",").filter(Boolean);

  const ergebnis = await ladeNkSchreiben(abrechnungId, { mietvertragIds: ids?.length ? ids : undefined, datum, frist });
  if (!ergebnis) return NextResponse.json({ error: "Abrechnung nicht gefunden." }, { status: 404 });
  if (ergebnis.schreiben.length === 0) {
    const grund = ergebnis.uebersprungen.map((u) => `${u.name}: ${u.grund}`).join(" · ") || "Keine Positionen mit Mietvertrag.";
    return NextResponse.json({ error: `Kein Schreiben möglich. ${grund}` }, { status: 422 });
  }

  const pdf = await nkSchreibenAlsPdf(ergebnis);
  const dateiname =
    ergebnis.schreiben.length === 1
      ? `Betriebskostenabrechnung ${ergebnis.jahr} ${ergebnis.schreiben[0].name.replace(/[\\/:*?"<>|]/g, "")}.pdf`
      : `Betriebskostenabrechnung ${ergebnis.jahr} (${ergebnis.schreiben.length} Schreiben).pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(dateiname)}`,
    },
  });
}
