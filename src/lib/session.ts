import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AktionsFehler } from "@/lib/aktion";
import { verwerfeStartseiteCache } from "@/lib/startseite-cache";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

/**
 * Für alle schreibenden Server Actions: Gäste haben nur Lesezugriff.
 *
 * Verwirft außerdem die zwischengespeicherten Kachelwerte der Startseite
 * (src/lib/startseite-cache.ts) — zentral hier, damit keine Aktion es vergessen kann. Deshalb nur
 * in Server Actions aufrufen, nicht beim Rendern einer Seite.
 *
 * `startseiteUnberuehrt`: nur für Aktionen, die nichts ändern, was die Startseite zeigt, **und** die
 * aktuelle Seite bewusst nicht neu rendern (reine Nachlade-Aktionen, Stern/Kommentar auf schweren
 * Seiten — docs/deployment-vercel.md). Das Verwerfen ließe Next die Seite sonst neu berechnen.
 */
export async function requireEditor(optionen?: { startseiteUnberuehrt?: boolean }) {
  const user = await requireUser();
  if (user.role === "GAST") {
    throw new AktionsFehler("Gäste haben nur Lesezugriff und können nichts ändern.");
  }
  if (!optionen?.startseiteUnberuehrt) verwerfeStartseiteCache();
  return user;
}

/** Lesbare Kennung des Nutzers für Nachvollziehbarkeit (z.B. Buchung.erstelltVon,
 * Dokument.hochgeladenVon) — bevorzugt die E-Mail (eindeutig), sonst der Name. */
export function benutzerLabel(user: { email?: string | null; name?: string | null }): string | null {
  return user.email ?? user.name ?? null;
}
