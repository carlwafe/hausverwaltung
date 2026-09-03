"use client";

import { useActionState, useRef, useEffect } from "react";
import { createBenutzer } from "./actions";

export function BenutzerForm() {
  const [error, formAction, pending] = useActionState(createBenutzer, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && error === null) formRef.current?.reset();
  }, [pending, error]);

  return (
    <form ref={formRef} action={formAction} className="max-w-md space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="email">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="password">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="role">
          Rolle
        </label>
        <select
          id="role"
          name="role"
          defaultValue="VERWALTER"
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="VERWALTER">Verwalter</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Anlegen…" : "Benutzer anlegen"}
      </button>
    </form>
  );
}
