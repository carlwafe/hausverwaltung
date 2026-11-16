import { revalidateTag, unstable_cache } from "next/cache";
import { berechneStartseiteWerte, zaehleStartseiteTickets, type StartseiteWerte } from "@/lib/startseite-werte";

// Zwischenspeicher der Startseite (docs/deployment-vercel.md): Die Kachelwerte werden einmal
// gerechnet und im Datencache von Next abgelegt; ein weiterer Aufruf der Startseite kostet dann
// keine Datenbankabfrage. Verworfen wird der Speicher von jeder schreibenden Aktion
// (requireEditor in session.ts) — so kann keine Aktion vergessen werden.
const STARTSEITE_TAG = "startseite";

// Teil des Schlüssels:
// - der Tag, weil Sollmiete, Fälligkeiten und „überfällig“ vom Datum abhängen (Ortszeit des
//   Servers, wie die Rechnung selbst);
// - das Deployment, damit eine geänderte Rechenregel oder eine Daten-Migration nicht den alten
//   Stand weiterzeigt (der Datencache überlebt Deployments).
function schluessel(): string[] {
  const n = new Date();
  const tag = `${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()}`;
  return [tag, process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "lokal"];
}

export function ladeStartseiteWerte(): Promise<StartseiteWerte> {
  return unstable_cache(berechneStartseiteWerte, ["startseite-werte", ...schluessel()], {
    tags: [STARTSEITE_TAG],
  })();
}

export function ladeStartseiteTickets(userId: string): Promise<{ offen: number; ueberfaellig: number }> {
  return unstable_cache(() => zaehleStartseiteTickets(userId), ["startseite-tickets", userId, ...schluessel()], {
    tags: [STARTSEITE_TAG],
  })();
}

/**
 * Verwirft die gespeicherten Kachelwerte sofort (der nächste Aufruf der Startseite rechnet neu).
 * Nur in Server Actions und Route Handlern aufrufbar, nicht beim Rendern einer Seite.
 *
 * Nebenwirkung: Next rendert danach die aktuelle Seite in der Antwort der Aktion neu, wie nach
 * einem `revalidatePath`. Aktionen, die das bewusst vermeiden, nehmen deshalb
 * `requireEditor({ startseiteUnberuehrt: true })`.
 */
export function verwerfeStartseiteCache(): void {
  revalidateTag(STARTSEITE_TAG, { expire: 0 });
}
