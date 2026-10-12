import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ladeJahresuebersicht, bildeZeitraum } from "@/app/(app)/jahresuebersicht/bericht-seite";
import { aufstellungAlsCsv } from "@/lib/aufstellung-export";

// CSV der Aufstellung für die Steuererklärung (nur lesend, auch für Gäste).
export async function GET(req: Request) {
  await requireUser();
  const jahr = Number(new URL(req.url).searchParams.get("jahr"));
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    return NextResponse.json({ error: "Ungültiges Jahr." }, { status: 400 });
  }

  const [daten, objekt] = await Promise.all([
    ladeJahresuebersicht(bildeZeitraum(jahr, 0)),
    prisma.objekt.findFirst({ select: { name: true } }),
  ]);
  const csv = aufstellungAlsCsv(daten.steuer, daten.steuerKosten, jahr, objekt?.name ?? "", daten.afaPositionen);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${jahr} Aufstellung Steuererklaerung.csv"`,
    },
  });
}
