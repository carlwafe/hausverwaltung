"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type RefObject } from "react";

function pad2(v: string) {
  return v.padStart(2, "0");
}

const segmentClass =
  "min-w-0 rounded-md border border-neutral-700 bg-transparent px-1 py-2 text-center text-sm outline-none focus:border-neutral-400";

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
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
}) {
  const [initJahr, initMonat, initTag] = (defaultValue ?? "").split("-");
  const [tag, setTag] = useState(initTag ?? "");
  const [monat, setMonat] = useState(initMonat ?? "");
  const [jahr, setJahr] = useState(initJahr ?? "");

  const tagRef = useRef<HTMLInputElement>(null);
  const monatRef = useRef<HTMLInputElement>(null);
  const jahrRef = useRef<HTMLInputElement>(null);

  const iso = tag && monat && jahr.length === 4 ? `${jahr}-${pad2(monat)}-${pad2(tag)}` : "";

  function handleDigitChange(
    raw: string,
    maxLen: number,
    setValue: (v: string) => void,
    nextRef?: RefObject<HTMLInputElement | null>,
  ) {
    const digits = raw.replace(/\D/g, "").slice(0, maxLen);
    setValue(digits);
    if (digits.length === maxLen && nextRef?.current) {
      nextRef.current.focus();
      nextRef.current.select();
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
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-1">
        <input
          id={id}
          ref={tagRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="TT"
          maxLength={2}
          value={tag}
          onFocus={(e) => e.target.select()}
          onChange={(e) => handleDigitChange(e.target.value, 2, setTag, monatRef)}
          onKeyDown={(e) => handleBackspace(e, tag)}
          onPaste={handlePaste}
          className={`${segmentClass} w-10`}
        />
        <span className="text-neutral-500">.</span>
        <input
          ref={monatRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="MM"
          maxLength={2}
          value={monat}
          onFocus={(e) => e.target.select()}
          onChange={(e) => handleDigitChange(e.target.value, 2, setMonat, jahrRef)}
          onKeyDown={(e) => handleBackspace(e, monat, tagRef)}
          onPaste={handlePaste}
          className={`${segmentClass} w-10`}
        />
        <span className="text-neutral-500">.</span>
        <input
          ref={jahrRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="JJJJ"
          maxLength={4}
          value={jahr}
          onFocus={(e) => e.target.select()}
          onChange={(e) => handleDigitChange(e.target.value, 4, setJahr)}
          onKeyDown={(e) => handleBackspace(e, jahr, monatRef)}
          onPaste={handlePaste}
          className={`${segmentClass} w-14`}
        />
      </div>
      <input type="hidden" name={name} value={iso} />
    </div>
  );
}
