"use client";

import { useSyncExternalStore } from "react";

type Wahl = "light" | "dark" | "system";

const listeners = new Set<() => void>();

function liesWahl(): Wahl {
  const w = document.cookie.match(/(?:^|; )theme=(\w+)/)?.[1];
  return w === "dark" || w === "light" ? w : "system";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function waehle(neu: Wahl) {
  document.cookie = `theme=${neu}; path=/; max-age=31536000; samesite=lax`;
  const dunkel = neu === "dark" || (neu === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dunkel ? "dark" : "light";
  listeners.forEach((l) => l());
}

// Darstellung wählen: Cookie "theme" (vom Root-Layout und vom Skript im <head> gelesen, damit es
// beim Laden nicht flackert) und sofort das Attribut am <html> setzen. "System" folgt dem Modus des
// Geräts; das Mitlaufen bei Wechsel übernimmt das Skript im <head> (layout.tsx). Gilt pro Browser,
// nicht pro Benutzerkonto.
export function ThemeSchalter() {
  const wahl = useSyncExternalStore(subscribe, liesWahl, () => "system" as Wahl);

  const optionen: { wert: Wahl; label: string }[] = [
    { wert: "light", label: "Hell" },
    { wert: "dark", label: "Dunkel" },
    { wert: "system", label: "System" },
  ];

  return (
    <div className="inline-flex rounded-md border border-neutral-700 p-0.5" role="group" aria-label="Darstellung">
      {optionen.map((o) => (
        <button
          key={o.wert}
          type="button"
          onClick={() => waehle(o.wert)}
          aria-pressed={wahl === o.wert}
          className={`rounded px-4 py-1.5 text-sm ${
            wahl === o.wert ? "bg-white font-medium text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
