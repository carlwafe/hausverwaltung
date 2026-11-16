"use client";

import { useRef } from "react";
import { RohdatenAnsicht } from "@/components/rohdaten-ansicht";

export function RohdatenDialog({
  rohdaten,
  downloadHref,
  downloadLabel,
  buttonLabel = "Rohdaten",
  buttonClassName = "text-xs text-neutral-400 underline hover:text-white",
}: {
  rohdaten: Record<string, string>;
  downloadHref?: string;
  downloadLabel?: string;
  buttonLabel?: string;
  buttonClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className={buttonClassName}>
        {buttonLabel}
      </button>
      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-full max-w-md rounded-md border border-neutral-700 bg-neutral-950 p-0 text-white backdrop:bg-[#000000]/60"
      >
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Rohdaten der Buchung</h3>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-neutral-400 hover:text-white"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
          {downloadHref && (
            <a href={downloadHref} className="mb-3 block text-sm text-white underline">
              {downloadLabel}
            </a>
          )}
          <div className="max-h-[60vh] overflow-y-auto">
            <RohdatenAnsicht rohdaten={rohdaten} schmal />
          </div>
        </div>
      </dialog>
    </>
  );
}
