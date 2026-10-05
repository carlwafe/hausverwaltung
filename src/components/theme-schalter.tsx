"use client";

import { useState } from "react";

type Theme = "light" | "dark";

// Darstellung wählen: Cookie "theme" (vom Root-Layout gelesen, damit es beim Laden nicht flackert)
// und sofort das Attribut am <html> setzen. Gilt pro Browser, nicht pro Benutzerkonto.
export function ThemeSchalter() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  function waehle(neu: Theme) {
    setTheme(neu);
    document.documentElement.dataset.theme = neu;
    document.cookie = `theme=${neu}; path=/; max-age=31536000; samesite=lax`;
  }

  const optionen: { wert: Theme; label: string }[] = [
    { wert: "light", label: "Hell" },
    { wert: "dark", label: "Dunkel" },
  ];

  return (
    <div className="inline-flex rounded-md border border-neutral-700 p-0.5" role="group" aria-label="Darstellung">
      {optionen.map((o) => (
        <button
          key={o.wert}
          type="button"
          onClick={() => waehle(o.wert)}
          aria-pressed={theme === o.wert}
          className={`rounded px-4 py-1.5 text-sm ${
            theme === o.wert ? "bg-white font-medium text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
