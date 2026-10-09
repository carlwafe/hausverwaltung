import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { leseDatei } from "@/lib/storage";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument) {
    return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  }

  let inhalt: Buffer;
  try {
    inhalt = await leseDatei(dokument.speicherpfad);
  } catch {
    return NextResponse.json({ error: "Datei nicht mehr verfügbar." }, { status: 404 });
  }

  // Bilder inline ausliefern (z.B. für Foto-Vorschauen als <img src>), alles andere weiterhin als
  // Download — ein Browser würde eine "attachment"-Disposition nicht als <img> rendern.
  // Mit ?ansicht=inline auch PDFs (Vorschau auf der Detailseite /dokumente/[id]).
  const inlineAngefordert = new URL(req.url).searchParams.get("ansicht") === "inline" && dokument.mimeType === "application/pdf";
  const disposition = dokument.mimeType?.startsWith("image/") || inlineAngefordert ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(inhalt), {
    headers: {
      "Content-Type": dokument.mimeType ?? "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(dokument.dateiname)}"`,
    },
  });
}
