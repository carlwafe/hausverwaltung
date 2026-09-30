import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AktionsFehler } from "@/lib/aktion";

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

/** Für alle schreibenden Server Actions: Gäste haben nur Lesezugriff. */
export async function requireEditor() {
  const user = await requireUser();
  if (user.role === "GAST") {
    throw new AktionsFehler("Gäste haben nur Lesezugriff und können nichts ändern.");
  }
  return user;
}

/** Lesbare Kennung des Nutzers für Nachvollziehbarkeit (z.B. Buchung.erstelltVon,
 * Dokument.hochgeladenVon) — bevorzugt die E-Mail (eindeutig), sonst der Name. */
export function benutzerLabel(user: { email?: string | null; name?: string | null }): string | null {
  return user.email ?? user.name ?? null;
}
