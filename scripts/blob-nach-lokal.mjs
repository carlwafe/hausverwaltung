// Einmaliger Umzug: lädt alle privaten Dateien aus Vercel Blob nach var/storage/<pfad>.
// In der DB steht der Blob-Pfad; der lokale Storage (src/lib/storage.ts) nutzt denselben relativen
// Pfad — die Datenbank muss also nicht angepasst werden.
//
// Aufruf (Zugangsdaten vorher mit `npx vercel env pull .env.blob.local` holen):
//   set -a; . ./.env.blob.local; set +a; node scripts/blob-nach-lokal.mjs
// Ziel ändern: ZIEL_ORDNER=/pfad/zu/storage node scripts/blob-nach-lokal.mjs
import { list, get } from "@vercel/blob";
import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";

const ziel = path.resolve(process.env.ZIEL_ORDNER ?? path.join(process.cwd(), "var", "storage"));
let geladen = 0;
let uebersprungen = 0;
const fehler = [];
let cursor;

do {
  const seite = await list({ cursor, limit: 500 });
  for (const blob of seite.blobs) {
    const datei = path.resolve(ziel, blob.pathname);
    if (!datei.startsWith(ziel + path.sep)) {
      fehler.push(`${blob.pathname}: Pfad außerhalb des Zielordners`);
      continue;
    }
    try {
      const vorhanden = await stat(datei).catch(() => null);
      if (vorhanden && vorhanden.size === blob.size) {
        uebersprungen++;
        continue;
      }
      const result = await get(blob.pathname, { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) throw new Error("nicht lesbar");
      const inhalt = Buffer.from(await new Response(result.stream).arrayBuffer());
      await mkdir(path.dirname(datei), { recursive: true });
      await writeFile(datei, inhalt);
      geladen++;
    } catch (err) {
      fehler.push(`${blob.pathname}: ${err instanceof Error ? err.message : err}`);
    }
  }
  cursor = seite.cursor;
} while (cursor);

console.log(`Geladen: ${geladen}, bereits vorhanden: ${uebersprungen}, Fehler: ${fehler.length}`);
for (const f of fehler) console.error(`  ${f}`);
process.exit(fehler.length ? 1 : 0);
