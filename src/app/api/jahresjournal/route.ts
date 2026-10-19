import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { ladeJahresjournal } from "@/lib/jahresjournal";
import { erzeugeJahresjournalPdf } from "@/lib/jahresjournal-pdf";
import { erzeugeGruppenPdf } from "@/lib/jahresjournal-gruppen-pdf";

// Jahresbericht Kontoführung als PDF (nur lesend, auch für Gäste), zwei Ansichten derselben Buchungen:
// nach Monaten (Journal mit Kontostand, Standard) oder `ansicht=gruppen` (nach Kosten-/Einnahmegruppen).
// Wird nur auf Knopfdruck gerechnet.
export async function GET(req: Request) {
  await requireUser();
  const url = new URL(req.url);
  const jahr = Number(url.searchParams.get("jahr"));
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    return NextResponse.json({ error: "Ungültiges Jahr." }, { status: 400 });
  }
  const gruppen = url.searchParams.get("ansicht") === "gruppen";
  const mitStornos = !gruppen && url.searchParams.get("stornos") === "1";

  const daten = await ladeJahresjournal(jahr, { mitStornos });
  if (!daten) {
    return NextResponse.json(
      { error: "Kein Referenz-Kontostand hinterlegt (Objekt-Einstellungen → Kontostand-Anker)." },
      { status: 409 },
    );
  }
  const pdf = gruppen ? await erzeugeGruppenPdf(daten) : await erzeugeJahresjournalPdf(daten);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${jahr} Jahresbericht ${gruppen ? "nach Gruppen" : "nach Monaten"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
