import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { BenutzerForm } from "./benutzer-form";
import { DeleteButton } from "@/components/delete-button";
import { deleteBenutzer } from "./actions";

export default async function BenutzerPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

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
                  <DeleteButton action={deleteBenutzer.bind(null, u.id)} label="Entfernen" />
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
