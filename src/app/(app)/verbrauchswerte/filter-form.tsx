"use client";

export function VerbrauchswerteFilterForm({
  jahr,
  kostenartId,
  kostenarten,
}: {
  jahr: number;
  kostenartId: string;
  kostenarten: { id: string; name: string; masseinheit: string | null }[];
}) {
  return (
    <form method="GET" className="flex items-end gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="jahr">
          Jahr
        </label>
        <input
          id="jahr"
          name="jahr"
          type="number"
          defaultValue={jahr}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          className="w-28 rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="kostenartId">
          Kostenart
        </label>
        <select
          id="kostenartId"
          name="kostenartId"
          defaultValue={kostenartId}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="w-64 rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="">– Kostenart wählen –</option>
          {kostenarten.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
              {k.masseinheit ? ` (${k.masseinheit})` : ""}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
