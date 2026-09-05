import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// Lokaler Datei-Storage außerhalb von /public, damit hochgeladene Dateien nicht direkt über
// eine URL erreichbar sind — Zugriff nur über die authentifizierte Download-Route.
const STORAGE_ROOT = path.join(process.cwd(), "var", "storage");

/** Speichert die Datei lokal und gibt den relativen Pfad zurück (in der DB abzulegen). */
export async function speichereDatei(inhalt: Buffer, originalDateiname: string): Promise<string> {
  await mkdir(STORAGE_ROOT, { recursive: true });
  const endung = path.extname(originalDateiname);
  const relativerPfad = `${randomUUID()}${endung}`;
  await writeFile(path.join(STORAGE_ROOT, relativerPfad), inhalt);
  return relativerPfad;
}

export async function leseDatei(relativerPfad: string): Promise<Buffer> {
  return readFile(path.join(STORAGE_ROOT, relativerPfad));
}

/** Löscht eine gespeicherte Datei; keine Fehlermeldung, falls sie bereits fehlt. */
export async function loescheDatei(relativerPfad: string): Promise<void> {
  try {
    await unlink(path.join(STORAGE_ROOT, relativerPfad));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
