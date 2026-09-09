// Neons kostenloser Tarif fährt die Datenbank nach Inaktivität komplett herunter
// ("Auto-Suspend") — die erste Verbindung danach braucht spürbar länger, um die Compute-Instanz
// wieder hochzufahren, als Prismas fest eingebautes 10-Sekunden-Timeout für den
// Migrations-Advisory-Lock erlaubt (P1002). Dieses Skript verbindet sich VOR `prisma migrate
// deploy` einmal separat und wartet mit eigenem, deutlich großzügigerem Timeout, bis die
// Datenbank wirklich antwortet — erst danach läuft die eigentliche Migration gegen eine bereits
// wache Datenbank, bei der das 10-Sekunden-Fenster ausreicht.
import pg from "pg";

const MAX_WARTEZEIT_MS = 90_000;
const VERSUCH_ABSTAND_MS = 3_000;

async function warteAufDatenbank() {
  const start = Date.now();
  let versuch = 0;

  while (Date.now() - start < MAX_WARTEZEIT_MS) {
    versuch++;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      console.log(`Datenbank erreichbar (Versuch ${versuch}, nach ${Date.now() - start}ms).`);
      return;
    } catch (err) {
      console.log(`Datenbank noch nicht bereit (Versuch ${versuch}): ${err.message}`);
      try {
        await client.end();
      } catch {
        // Verbindung war ohnehin nie richtig aufgebaut.
      }
      await new Promise((resolve) => setTimeout(resolve, VERSUCH_ABSTAND_MS));
    }
  }

  throw new Error(`Datenbank nach ${MAX_WARTEZEIT_MS}ms weiterhin nicht erreichbar.`);
}

warteAufDatenbank().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
