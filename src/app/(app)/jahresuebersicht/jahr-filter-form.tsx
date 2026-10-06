"use client";

// quartal: 0 = ganzes Jahr, 1–4 = einzelnes Quartal. Bewusst ohne automatisches Absenden beim
// Ändern der Auswahl: jede Abfrage rechnet den ganzen Bericht (Vercel-CPU, siehe CLAUDE.md).
export function JahrFilterForm({ jahr, quartal }: { jahr: number; quartal: number }) {
  const bis = Math.max(new Date().getFullYear() + 1, jahr);
  const von = Math.min(2020, jahr);
  const jahre: number[] = [];
  for (let j = bis; j >= von; j--) jahre.push(j);
  const selectCls =
    "rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400";

  return (
    <form method="GET" className="flex items-end gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="jahr">
          Jahr
        </label>
        <select
          id="jahr"
          name="jahr"
          defaultValue={jahr}
          className={`w-28 ${selectCls}`}
        >
          {jahre.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="quartal">
          Zeitraum
        </label>
        <select
          id="quartal"
          name="quartal"
          defaultValue={quartal}
          className={`w-28 ${selectCls}`}
        >
          <option value={0}>Gesamtjahr</option>
          {[1, 2, 3, 4].map((q) => (
            <option key={q} value={q}>
              Q{q}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
      >
        Anzeigen
      </button>
    </form>
  );
}
