"use client";

export function JahrFilterForm({ jahr }: { jahr: number }) {
  const bis = Math.max(new Date().getFullYear() + 1, jahr);
  const von = Math.min(2020, jahr);
  const jahre: number[] = [];
  for (let j = bis; j >= von; j--) jahre.push(j);

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
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="w-28 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          {jahre.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
