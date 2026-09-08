"use client";

export function JahrFilterForm({ jahr }: { jahr: number }) {
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
    </form>
  );
}
