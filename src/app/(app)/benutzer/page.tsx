import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { BenutzerForm } from "./benutzer-form";
import { DeleteButton } from "@/components/delete-button";
import { deleteBenutzer } from "./actions";
import { BenutzerBearbeiten } from "./benutzer-bearbeiten";

export default async function BenutzerPage() {
  await requireAdmin();
  const alle = await prisma.user.findMany();
  // Name = "Vorname Nachname": Nachname ist das letzte Wort, der Rest der Vorname.
  const teile = (name: string | null) => {
    const woerter = (name ?? "").trim().split(/\s+/).filter(Boolean);
    return { nach: woerter.pop() ?? "", vor: woerter.join(" ") };
  };
  const users = alle.sort((a, b) => {
    const x = teile(a.name);
    const y = teile(b.name);
    return (
      x.nach.localeCompare(y.nach, "de") ||
      x.vor.localeCompare(y.vor, "de") ||
      a.email.localeCompare(b.email, "de")
    );
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Benutzer</h1>

      <div className="mb-8 overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">E-Mail</th>
              <th className="px-4 py-2">Rolle</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-neutral-800">
                <td className="px-4 py-2">{u.name ?? "–"}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.role === "ADMIN" ? "Admin" : "Gast"}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-start justify-end gap-4">
                    <BenutzerBearbeiten id={u.id} name={u.name} email={u.email} />
                    <DeleteButton action={deleteBenutzer.bind(null, u.id)} label="Entfernen" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Neuen Benutzer anlegen</h2>
      <BenutzerForm />
    </div>
  );
}
