"use client";

import { useRef } from "react";

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
        className="m-auto w-full max-w-md rounded-md border border-neutral-700 bg-neutral-950 p-0 text-white backdrop:bg-black/60"
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
          <dl className="max-h-[60vh] space-y-2 overflow-y-auto text-xs">
            {Object.entries(rohdaten)
              .filter(([, v]) => v)
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-neutral-500">{key}</dt>
                  <dd className="break-words text-neutral-200">{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      </dialog>
    </>
  );
}
