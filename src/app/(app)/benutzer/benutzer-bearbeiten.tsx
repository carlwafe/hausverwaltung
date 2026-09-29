"use client";

import { useState, useTransition } from "react";
import { updateBenutzer } from "./actions";

const inputClass =
  "w-full rounded-md border border-neutral-700 px-2 py-1 text-sm outline-none focus:border-neutral-400";

export function BenutzerBearbeiten({
  id,
  name,
  email,
}: {
  id: string;
  name: string | null;
  email: string;
}) {
  const [offen, setOffen] = useState(false);
  const [n, setN] = useState(name ?? "");
  const [e, setE] = useState(email);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => {
          setN(name ?? "");
          setE(email);
          setError(null);
          setOffen(true);
        }}
        className="text-sm text-neutral-300 hover:text-white"
      >
        Bearbeiten
      </button>
    );
  }

  return (
    <div className="space-y-2 text-left">
      <input value={n} onChange={(x) => setN(x.target.value)} placeholder="Name" className={inputClass} />
      <input
        value={e}
        type="email"
        onChange={(x) => setE(x.target.value)}
        placeholder="E-Mail"
        className={inputClass}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const err = await updateBenutzer(id, n, e);
              setError(err);
              if (!err) setOffen(false);
            })
          }
          className="text-sm font-medium text-white hover:underline disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Speichern"}
        </button>
        <button type="button" onClick={() => setOffen(false)} className="text-sm text-neutral-400 hover:text-white">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
