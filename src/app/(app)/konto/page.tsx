"use client";

import { useActionState, useRef, useEffect } from "react";
import { changePassword } from "./actions";

export default function KontoPage() {
  const [message, formAction, pending] = useActionState(changePassword, null);
  const formRef = useRef<HTMLFormElement>(null);
  const success = message === "Passwort wurde geändert.";

  useEffect(() => {
    if (success) formRef.current?.reset();
  }, [success]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Mein Konto</h1>
      <h2 className="mb-4 text-lg font-medium">Passwort ändern</h2>
      <form ref={formRef} action={formAction} className="max-w-md space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="aktuellesPasswort">
            Aktuelles Passwort
          </label>
          <input
            id="aktuellesPasswort"
            name="aktuellesPasswort"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="neuesPasswort">
            Neues Passwort
          </label>
          <input
            id="neuesPasswort"
            name="neuesPasswort"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="neuesPasswortWiederholen">
            Neues Passwort wiederholen
          </label>
          <input
            id="neuesPasswortWiederholen"
            name="neuesPasswortWiederholen"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>

        {message && (
          <p className={`text-sm ${success ? "text-green-400" : "text-red-400"}`}>{message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Passwort ändern"}
        </button>
      </form>
    </div>
  );
}
