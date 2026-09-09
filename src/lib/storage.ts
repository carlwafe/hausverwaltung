import { put, get, del } from "@vercel/blob";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// Vercel Blob (access: "private") wird nur genutzt, wenn die App tatsächlich auf Vercel läuft
// (Build oder Runtime) — dafür setzt Vercel automatisch VERCEL=1, unabhängig davon, welche
// Zugangsdaten sonst gerade im Environment stehen. Bewusst NICHT anhand von
// BLOB_READ_WRITE_TOKEN/VERCEL_OIDC_TOKEN erkannt: `vercel link`/`vercel env pull` legen einen
// VERCEL_OIDC_TOKEN auch in die lokale .env.local, ohne dass man tatsächlich auf Vercel läuft —
// das hätte sonst lokale Entwicklung fälschlich auf den (leeren) Produktions-Blob-Speicher
// umgeleitet. Ohne VERCEL=1 läuft weiterhin der lokale Datei-Storage wie bisher. Auf Vercel
// selbst ist ein lokaler Storage keine Option: der Server läuft dort serverless mit flüchtigem
// Dateisystem, Dateien würden spätestens beim nächsten Deploy verschwinden. Private Blobs sind
// nie über eine öffentliche URL erreichbar, egal ob der Pfad bekannt ist — Zugriff nur per get()
// aus Server-Code, hier ausschließlich über die authentifizierte Download-Route.
const BLOB_VERFUEGBAR = process.env.VERCEL === "1";

const STORAGE_ROOT = path.join(process.cwd(), "var", "storage");

async function speichereLokal(inhalt: Buffer, endung: string): Promise<string> {
  await mkdir(STORAGE_ROOT, { recursive: true });
  const relativerPfad = `${randomUUID()}${endung}`;
  await writeFile(path.join(STORAGE_ROOT, relativerPfad), inhalt);
  return relativerPfad;
}

/** Lädt die Datei hoch (Blob oder lokal) und gibt den Pfad zurück (in der DB abzulegen). */
export async function speichereDatei(inhalt: Buffer, originalDateiname: string): Promise<string> {
  const endung = path.extname(originalDateiname);
  if (!BLOB_VERFUEGBAR) return speichereLokal(inhalt, endung);

  const blob = await put(`${randomUUID()}${endung}`, inhalt, { access: "private" });
  return blob.pathname;
}

export async function leseDatei(pfad: string): Promise<Buffer> {
  if (!BLOB_VERFUEGBAR) return readFile(path.join(STORAGE_ROOT, pfad));

  const result = await get(pfad, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Datei nicht gefunden: ${pfad}`);
  }

  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Löscht eine gespeicherte Datei; keine Fehlermeldung, falls sie bereits fehlt. */
export async function loescheDatei(pfad: string): Promise<void> {
  if (!BLOB_VERFUEGBAR) {
    try {
      await unlink(path.join(STORAGE_ROOT, pfad));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    return;
  }

  // del() im Vercel-Blob-SDK wirft ohnehin nie bei fehlender Datei.
  await del(pfad);
}
