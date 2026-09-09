// `prisma migrate deploy` schlägt gelegentlich mit einem Advisory-Lock-Timeout (P1002) fehl,
// obwohl ein direkter `SELECT pg_advisory_lock(...)` per psql im selben Moment sofort
// durchläuft und kein anderer Prozess die Sperre hält — offenbar eine gelegentliche
// Unzuverlässigkeit auf Neons Proxy-Schicht speziell bei diesem Aufruf, kein echtes Lock-Problem
// (vgl. wake-db.mjs, das genau das schon ausschließt). Ein einzelner Wiederholungsversuch hat
// sich als nicht robust genug erwiesen — hier deshalb mehrere Versuche mit Pause dazwischen.
import { spawnSync } from "child_process";

const MAX_VERSUCHE = 5;
const PAUSE_SEKUNDEN = 8;

for (let versuch = 1; versuch <= MAX_VERSUCHE; versuch++) {
  console.log(`prisma migrate deploy — Versuch ${versuch}/${MAX_VERSUCHE}`);
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status === 0) {
    console.log("prisma migrate deploy erfolgreich.");
    process.exit(0);
  }

  if (versuch < MAX_VERSUCHE) {
    console.log(`Fehlgeschlagen (Exit ${result.status}), warte ${PAUSE_SEKUNDEN}s vor erneutem Versuch…`);
    // Node hat keinen eingebauten synchronen Sleep — `sleep` als Kindprozess ist im
    // Linux-Build-Container (Vercel) immer vorhanden und einfacher als ein Busy-Wait.
    spawnSync("sleep", [String(PAUSE_SEKUNDEN)]);
  }
}

console.error(`prisma migrate deploy nach ${MAX_VERSUCHE} Versuchen weiterhin fehlgeschlagen.`);
process.exit(1);
