import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { leseDatei } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch || !batch.speicherpfad) {
    return NextResponse.json({ error: "Originaldatei nicht verfügbar." }, { status: 404 });
  }

  let inhalt: Buffer;
  try {
    inhalt = await leseDatei(batch.speicherpfad);
  } catch {
    return NextResponse.json({ error: "Originaldatei nicht mehr verfügbar." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(inhalt), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(batch.dateiname)}"`,
    },
  });
}
