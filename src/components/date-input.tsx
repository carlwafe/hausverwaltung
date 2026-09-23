"use client";

import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent, type RefObject } from "react";

function istGueltig(iso: string) {
  const [j, m, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

function pad2(v: string) {
  return v.padStart(2, "0");
}

const segmentBase = "min-w-0 rounded-md border border-neutral-700 bg-transparent text-center outline-none focus:border-neutral-400 disabled:opacity-50";
const segmentSize = { md: "px-1 py-2 text-sm", sm: "px-1 py-1.5 text-sm" } as const;

function zerlege(iso: string | undefined): [string, string, string] {
  const [j, m, t] = (iso ?? "").split("-");
  return [t ?? "", m ?? "", j ?? ""];
}

/**
 * Tag/Monat/Jahr-Eingabe mit Auto-Sprung zum nächsten Feld statt eines nativen
 * `<input type="date">` — native Datumsfelder springen browserabhängig unzuverlässig
 * weiter und haben in Safari einen bekannten Bug, bei dem eine kurze Tippause im
 * Jahresfeld die Eingabe zurücksetzt.
 */
export function DateInput({
  id,
  name,
  label,
  defaultValue,
  value,
  onChange,
  required = false,
  disabled = false,
  size = "md",
  labelClassName = "",
}: {
  id?: string;
  name?: string;
  label?: string;
  defaultValue?: string;
  /** Gesteuerter Wert (yyyy-mm-dd oder ""): wird übernommen, wenn er sich von außen ändert (z.B.
   * Zurücksetzen nach dem Speichern). Tippen im Feld meldet sich weiterhin über onChange. */
  value?: string;
  /** Wird mit yyyy-mm-dd aufgerufen, sobald ein vollständiges gültiges Datum eingetragen ist, und
   * mit "", wenn alle Felder leer sind — bei unvollständiger Eingabe (mitten im Tippen) nicht. */
  onChange?: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  size?: "md" | "sm";
  labelClassName?: string;
}) {
  const autoId = useId();
  const feldId = id ?? autoId;
  const [initTag, initMonat, initJahr] = zerlege(value ?? defaultValue);
  const [tag, setTag] = useState(initTag);
  const [monat, setMonat] = useState(initMonat);
  const [jahr, setJahr] = useState(initJahr);
  const zuletztGemeldet = useRef(value ?? defaultValue ?? "");

  const tagRef = useRef<HTMLInputElement>(null);
  const monatRef = useRef<HTMLInputElement>(null);
  const jahrRef = useRef<HTMLInputElement>(null);

  // Unvollständige oder unmögliche Eingaben (z.B. 31.02.) werden bewusst als ungültiger Wert
  // abgeschickt, damit der Server einen Fehler meldet, statt das Datum still zu verwerfen/zu verschieben.
  const irgendwasEingetragen = tag !== "" || monat !== "" || jahr !== "";
  const iso = irgendwasEingetragen ? `${jahr.padStart(4, "0")}-${pad2(monat)}-${pad2(tag)}` : "";
  const ungueltig = irgendwasEingetragen && jahr.length === 4 && !istGueltig(iso);

  // Von außen geänderter Wert (z.B. leer nach dem Speichern) — nur übernehmen, wenn er nicht der
  // Wert ist, den dieses Feld selbst zuletzt gemeldet hat, sonst würde eine halb getippte Eingabe
  // beim Rückfluss des eigenen onChange-Werts überschrieben.
  useEffect(() => {
    if (value === undefined || value === zuletztGemeldet.current) return;
    zuletztGemeldet.current = value;
    const [t, m, j] = zerlege(value);
    setTag(t);
    setMonat(m);
    setJahr(j);
  }, [value]);

  useEffect(() => {
    if (!onChange) return;
    const gemeldet = !irgendwasEingetragen ? "" : jahr.length === 4 && !ungueltig ? iso : null;
    if (gemeldet === null || gemeldet === zuletztGemeldet.current) return;
    zuletztGemeldet.current = gemeldet;
    onChange(gemeldet);
  }, [iso, irgendwasEingetragen, jahr, ungueltig, onChange]);

  function handleDigitChange(
    raw: string,
    maxLen: number,
    setValue: (v: string) => void,
    next?: { ref: RefObject<HTMLInputElement | null>; set: (v: string) => void; maxLen: number },
  ) {
    const alle = raw.replace(/\D/g, "");
    const digits = alle.slice(0, maxLen);
    setValue(digits);
    if (digits.length === maxLen && next?.ref.current) {
      // Tippt jemand schneller, als der Fokus weiterspringt, landen überzählige Ziffern im
      // vollen Feld — sie gehören ins nächste Feld, statt verloren zu gehen.
      const rest = alle.slice(maxLen, maxLen + next.maxLen);
      if (rest) next.set(rest);
      next.ref.current.focus();
      if (!rest) next.ref.current.select();
    }
  }

  function handleBackspace(
    e: KeyboardEvent<HTMLInputElement>,
    value: string,
    prevRef?: RefObject<HTMLInputElement | null>,
  ) {
    if (e.key === "Backspace" && value === "" && prevRef?.current) {
      prevRef.current.focus();
      prevRef.current.select();
    }
  }

  // Erlaubt das Einfügen eines kompletten Datums (z.B. aus einer Tabelle kopiert) in ein
  // beliebiges der drei Felder, statt es nur ins erste Feld zu quetschen.
  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    const match = text.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
    if (!match) return;
    e.preventDefault();
    const [, t, m, j] = match;
    setTag(t.slice(0, 2));
    setMonat(m.slice(0, 2));
    setJahr(j.slice(0, 4));
    jahrRef.current?.focus();
  }

  return (
    <div className="min-w-0">
      {label && (
        <label className={`mb-1 flex items-end text-sm font-medium ${labelClassName}`} htmlFor={feldId}>
          {label}
        </label>
      )}
      <div className="flex min-w-0 items-center gap-1">
        <input
          id={feldId}
          ref={tagRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="TT"
          value={tag}
          required={required}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => handleDigitChange(e.target.value, 2, setTag, { ref: monatRef, set: setMonat, maxLen: 2 })}
          onKeyDown={(e) => handleBackspace(e, tag)}
          onPaste={handlePaste}
          className={`${segmentBase} ${segmentSize[size]} w-10`}
        />
        <span className="text-neutral-500">.</span>
        <input
          ref={monatRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="MM"
          value={monat}
          required={required}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => handleDigitChange(e.target.value, 2, setMonat, { ref: jahrRef, set: setJahr, maxLen: 4 })}
          onKeyDown={(e) => handleBackspace(e, monat, tagRef)}
          onPaste={handlePaste}
          className={`${segmentBase} ${segmentSize[size]} w-10`}
        />
        <span className="text-neutral-500">.</span>
        <input
          ref={jahrRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="JJJJ"
          value={jahr}
          required={required}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => handleDigitChange(e.target.value, 4, setJahr)}
          onKeyDown={(e) => handleBackspace(e, jahr, monatRef)}
          onPaste={handlePaste}
          className={`${segmentBase} ${segmentSize[size]} w-14`}
        />
      </div>
      {ungueltig && <p className="mt-1 text-xs text-red-400">Ungültiges Datum</p>}
      {name && <input type="hidden" name={name} value={iso} disabled={disabled} />}
    </div>
  );
}
