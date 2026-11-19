import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sichtbareTicketDokumente } from "@/lib/ticket";
import { requireUser } from "@/lib/session";
import { leseDatei } from "@/lib/storage";

// Content-Disposition mit Dateinamen: `filename` als ASCII-Ersatz für alte Browser, `filename*`
// (RFC 5987) mit dem echten Namen — sonst landen Umlaute/Leerzeichen als "%20" im gespeicherten Namen.
function disposition(art: "inline" | "attachment", dateiname: string): string {
  const ascii = dateiname.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${art}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(dateiname)}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const dokument = await prisma.dokument.findFirst({ where: { id, ...sichtbareTicketDokumente(user.id) } });
  if (!dokument) {
    return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  }

  let inhalt: Buffer;
  try {
    inhalt = await leseDatei(dokument.speicherpfad);
  } catch {
    return NextResponse.json({ error: "Datei nicht mehr verfügbar." }, { status: 404 });
  }

  // PDFs und Bilder zeigt der Browser selbst an (Link mit target="_blank" öffnet den PDF-Betrachter,
  // Foto-Vorschauen nutzen die Route als <img src>). Mit ?download=1 immer als Datei speichern.
  // Andere Dateitypen kann der Browser meist nicht anzeigen — die bleiben ein Download.
  const herunterladen = new URL(req.url).searchParams.get("download") === "1";
  const anzeigbar = dokument.mimeType === "application/pdf" || !!dokument.mimeType?.startsWith("image/");

  return new NextResponse(new Uint8Array(inhalt), {
    headers: {
      "Content-Type": dokument.mimeType ?? "application/octet-stream",
      "Content-Disposition": disposition(anzeigbar && !herunterladen ? "inline" : "attachment", dokument.dateiname),
    },
  });
}
