import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

// Temporärer, einmaliger Helfer für die Daten-Migration: lädt eine lokal noch vorhandene, aber
// nie zu Vercel Blob hochgeladene Kontoauszugs-Datei unter exakt demselben Dateinamen hoch, den
// die Datenbank für sie bereits erwartet (import_batches.speicherpfad). Geschützt durch ein
// eigenes Geheimnis statt einer Admin-Session, weil der Aufruf von einem lokalen Skript kommt,
// nicht aus dem Browser. Nach der Migration wieder entfernen.
export async function POST(req: Request) {
  const secret = req.headers.get("x-migration-secret");
  if (!secret || secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { filename, contentBase64 } = (await req.json()) as {
    filename?: string;
    contentBase64?: string;
  };
  if (!filename || !contentBase64) {
    return NextResponse.json({ error: "filename und contentBase64 erforderlich" }, { status: 400 });
  }

  const buffer = Buffer.from(contentBase64, "base64");
  const blob = await put(filename, buffer, { access: "private", addRandomSuffix: false });

  return NextResponse.json({ ok: true, pathname: blob.pathname });
}
