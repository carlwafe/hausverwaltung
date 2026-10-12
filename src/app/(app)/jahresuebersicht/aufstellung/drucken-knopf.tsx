"use client";

export function DruckenKnopf() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
    >
      Drucken / als PDF sichern
    </button>
  );
}
