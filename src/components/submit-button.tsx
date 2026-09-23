"use client";

import { useFormStatus } from "react-dom";

// Ersatz für ein einfaches <button type="submit"> innerhalb eines Server-Action-<form> — zeigt
// während der Aktion einen Drehkreis + optional einen anderen Text, statt dass der Nutzer nach dem
// Klick ohne jede Rückmeldung wartet, ob überhaupt etwas passiert (z.B. "Neu berechnen" bei der
// Nebenkostenabrechnung, das je nach Datenmenge spürbar dauert). useFormStatus findet automatisch
// das nächste umschließende <form>, unabhängig davon, ob dieses von einer Server- oder
// Client-Komponente gerendert wird.
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
    >
      {pending && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
