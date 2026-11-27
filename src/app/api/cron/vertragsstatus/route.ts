import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { gleicheVertragsstatusAb } from "@/lib/vertragsstatus-abgleich";
import { verwerfeStartseiteCache } from "@/lib/startseite-cache";

// Nächtlicher Abgleich des Vertragsstatus mit Beginn/Mietende (Vercel Cron, vercel.json).
// Ohne Anmeldung erreichbar (src/proxy.ts), geschützt über CRON_SECRET: Vercel schickt es als
// „Authorization: Bearer …“ mit. Fehlt die Variable, lehnt die Route jeden Aufruf ab.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 401 });
  }
  const ergebnis = await gleicheVertragsstatusAb();
  if (ergebnis.beendet > 0 || ergebnis.aktiv > 0) {
    verwerfeStartseiteCache();
    revalidatePath("/", "layout");
  }
  return NextResponse.json(ergebnis);
}
