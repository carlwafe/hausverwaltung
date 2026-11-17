import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { ladeEinzugslauf } from "@/lib/lastschrift-einzug";

// Einzugsdatei (pain.008.001.08) der Mieten als Download. Nur lesend; enthält IBANs und Mandate, deshalb nicht für Gäste.
// Wird nur auf Knopfdruck gerechnet (docs/deployment-vercel.md).
export async function GET(req: Request) {
  const user = await requireUser();
  if (user.role === "GAST") {
    return NextResponse.json({ error: "Gäste dürfen keine Einzugsdatei erzeugen." }, { status: 403 });
  }
  const url = new URL(req.url);
  const m = /^(\d{4})-(\d{2})$/.exec(url.searchParams.get("monat") ?? "");
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
    return NextResponse.json({ error: "Ungültiger Monat (JJJJ-MM)." }, { status: 400 });
  }
  const lauf = await ladeEinzugslauf({
    jahr: Number(m[1]),
    monat: Number(m[2]),
    faelligAm: url.searchParams.get("datum"),
    ohne: url.searchParams.getAll("ohne"),
  });
  if (!lauf.xml) {
    return NextResponse.json({ error: lauf.dateiFehler ?? "Die Datei lässt sich nicht erzeugen." }, { status: 409 });
  }
  return new NextResponse(lauf.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${lauf.dateiname}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
