import type { ReactNode } from "react";
import Link from "next/link";
import { ZahlungswegHinweisAktionen } from "./zahlungsweg-hinweis-aktionen";

const STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv",
  GEPLANT: "Geplant",
  BEENDET: "Beendet",
};

const STATUS_FARBE: Record<string, string> = {
  AKTIV: "bg-green-500/10 text-green-400",
  GEPLANT: "bg-amber-500/10 text-amber-400",
  BEENDET: "bg-neutral-800 text-neutral-300",
};

const ZAHLUNGSWEG_LABEL: Record<string, string> = {
  LASTSCHRIFT: "SEPA-Lastschrift",
  UEBERWEISUNG: "Überweisung / Dauerauftrag",
  BEHOERDE: "Amt zahlt (Jobcenter, Kreis)",
};

const ANLAGEFORM_LABEL: Record<string, string> = {
  KAUTIONSKONTO: "Kautionskonto",
  SPARBUCH: "Sparbuch",
  BUERGSCHAFT: "Bürgschaft",
  BAR: "Bar",
};

function Kasten({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{titel}</h2>
      {children}
    </section>
  );
}

// Eine Zeile „Beschriftung … Wert“; `betont` = Summenzeile mit Trennlinie.
function Zeile({ label, value, betont = false, title }: { label: string; value: ReactNode; betont?: boolean; title?: string }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-0.5 text-sm ${betont ? "mt-1 border-t border-neutral-800 pt-1.5 font-semibold" : ""}`}
      title={title}
    >
      <dt className={betont ? "text-white" : "text-neutral-400"}>{label}</dt>
      <dd className="min-w-0 text-right text-white tabular-nums">{value}</dd>
    </div>
  );
}

function farbeFuerSaldo(wert: number) {
  return wert < -0.005 ? "text-red-400" : wert > 0.005 ? "text-green-400" : "text-white";
}

/**
 * Kopf der Mietvertragsseite: Titel mit Status/Adresse, darunter vier Kästen (Vertrag, Miete,
 * Kaution, Mietkonto) — am Computer nebeneinander, damit das Mieterkonto ohne Scrollen beginnt.
 * Alles nur zum Lesen; Bearbeiten (Formular, Mieterhöhungen, Löschen) passiert auf der Unterseite
 * /mietvertraege/[id]/bearbeiten.
 */
export function EckdatenSektion({
  mietvertragId,
  einheitLabel,
  mieterNamen,
  adresse,
  wohnflaecheText,
  beginnText,
  endeText,
  kaltmieteText,
  nebenkostenText,
  mehrwertsteuerText,
  gesamtmieteText,
  status,
  eigenerStichtagText,
  zahlungsweg,
  notiz = null,
  zahlungswegHinweis = null,
  mandat = null,
  kaution,
  mietkonto,
  letzteErhoehungText,
  nachlassTexte = [],
}: {
  mietvertragId: string;
  einheitLabel: string;
  mieterNamen: string;
  adresse: string | null;
  wohnflaecheText: string | null;
  beginnText: string;
  endeText: string;
  kaltmieteText: string;
  nebenkostenText: string;
  // Nur bei Verträgen mit Umsatzsteuer (Garagen), sonst null.
  mehrwertsteuerText: string | null;
  gesamtmieteText: string;
  status: string;
  // Eigener Buchhaltungs-Stichtag des Vertrags (formatiert), nur wenn er vom Objekt abweicht.
  eigenerStichtagText: string | null;
  zahlungsweg: string | null;
  // Interne Notiz des Vertrags (Freitext), null/leer = keine.
  notiz?: string | null;
  // Vorgeschlagener Zahlungsweg laut jüngsten Zahlungen, wenn er vom erfassten abweicht (Warnung), sonst null.
  zahlungswegHinweis?: string | null;
  // SEPA-Mandat des Vertrags (alle Werte bereits formatiert); null = nichts erfasst.
  mandat?: { referenz: string | null; glaeubigerId: string | null; datumText: string | null; kontoinhaber: string | null; iban: string | null } | null;
  kaution: { betragText: string; anlageform: string; einzahlungUnbekannt: boolean; guthabenText: string } | null;
  // Soll/Ist-Rechnung des Mietkontos; die Zeilen ergeben zusammen den Saldo.
  mietkonto: {
    saldo: number;
    saldoText: string;
    sollText: string;
    istText: string;
    saldovortrag: number;
    saldovortragText: string;
    // Wirkung der Sonderbuchungen (Gebühren ./. Zahlungen/Verrechnungen darauf) auf den Saldo, nur wenn ungleich 0.
    sonderbuchungen: number;
    sonderbuchungenText: string | null;
    // Gegenrechnung der BK-Vorauszahlung versendeter Abrechnungen, nur wenn ungleich 0.
    gegenrechnungText: string | null;
    zeitraumText: string;
  };
  // Hinweis auf die letzte Mieterhöhung (z.B. "Miete zuletzt zum 1.5.2026 auf 620,00 € Kaltmiete +
  // 200,00 € BK erhöht") — die volle Historie/Erfassung steht auf der Bearbeiten-Unterseite.
  letzteErhoehungText: string | null;
  // Einmalige Mietnachlässe einzelner Monate, je eine Zeile (z.B. "04/2026: −150,00 € Kaltmiete (Einzug erst am 11.4.)").
  nachlassTexte?: string[];
}) {
  const hatHinweise = notiz || zahlungswegHinweis || mandat || zahlungsweg === "LASTSCHRIFT" || letzteErhoehungText || nachlassTexte.length > 0;
  return (
    <div className="mb-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">
            {einheitLabel} — {mieterNamen}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
            <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_FARBE[status] ?? STATUS_FARBE.BEENDET}`}>
              {STATUS_LABEL[status] ?? status}
            </span>
            {adresse && <span>{adresse}</span>}
            {wohnflaecheText && (
              <>
                <span aria-hidden="true">·</span>
                <span>{wohnflaecheText}</span>
              </>
            )}
          </p>
        </div>
        <Link
          href={`/mietvertraege/${mietvertragId}/bearbeiten`}
          className="inline-flex h-10 items-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-white hover:bg-neutral-900"
        >
          Bearbeiten
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kasten titel="Vertrag">
          <dl>
            <Zeile label="Mietbeginn" value={beginnText} />
            <Zeile label="Mietende" value={endeText} />
            <Zeile label="Zahlungsweg" value={zahlungsweg ? ZAHLUNGSWEG_LABEL[zahlungsweg] ?? zahlungsweg : "nicht erfasst"} />
            {eigenerStichtagText && <Zeile label="Buchhaltung ab" value={eigenerStichtagText} />}
          </dl>
        </Kasten>

        <Kasten titel="Miete (aktuell)">
          <dl>
            <Zeile label="Kaltmiete" value={kaltmieteText} />
            <Zeile label="BK-Vorauszahlung" value={nebenkostenText} />
            {mehrwertsteuerText && <Zeile label="Umsatzsteuer" value={mehrwertsteuerText} />}
            <Zeile label="Gesamt" value={gesamtmieteText} betont />
          </dl>
        </Kasten>

        <Kasten titel="Kaution">
          {kaution ? (
            <dl>
              <Zeile label="Vereinbart" value={kaution.betragText} />
              <Zeile label="Anlageform" value={ANLAGEFORM_LABEL[kaution.anlageform] ?? kaution.anlageform} />
              <Zeile label="Guthaben aktuell" value={kaution.guthabenText} />
              {kaution.einzahlungUnbekannt && (
                <p className="mt-1 text-xs text-neutral-500">Eingezahlt vor Buchhaltungsbeginn, Datum unbekannt.</p>
              )}
            </dl>
          ) : (
            <p className="text-sm text-neutral-500">Keine Kaution erfasst.</p>
          )}
        </Kasten>

        <Kasten titel="Mietkonto">
          <dl>
            <Zeile label="Soll" value={mietkonto.sollText} />
            <Zeile label="Ist (Zahlungen)" value={mietkonto.istText} />
            <Zeile
              label="Saldovortrag"
              value={<span className={farbeFuerSaldo(mietkonto.saldovortrag)}>{mietkonto.saldovortragText}</span>}
            />
            {mietkonto.sonderbuchungenText && (
              <Zeile
                label="Sonderbuchungen"
                value={<span className={farbeFuerSaldo(mietkonto.sonderbuchungen)}>{mietkonto.sonderbuchungenText}</span>}
                title="Gebühren an den Mieter abzüglich Zahlungen und Verrechnungen darauf (orange Zeilen im Mieterkonto)"
              />
            )}
            {mietkonto.gegenrechnungText && (
              <Zeile
                label="Gegenrechnung BK"
                value={mietkonto.gegenrechnungText}
                title="Gutschrift/Belastung der BK-Vorauszahlung versendeter Betriebskostenabrechnungen"
              />
            )}
            <Zeile label="Saldo" value={<span className={farbeFuerSaldo(mietkonto.saldo)}>{mietkonto.saldoText}</span>} betont />
          </dl>
          <p className="mt-1 text-xs text-neutral-500">{mietkonto.zeitraumText}</p>
        </Kasten>
      </div>

      {hatHinweise && (
        <div className="mt-3 space-y-2">
          {zahlungswegHinweis && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
              <span>
                Zahlungsweg prüfen: Die jüngsten Zahlungen sprechen für „{ZAHLUNGSWEG_LABEL[zahlungswegHinweis] ?? zahlungswegHinweis}“.
              </span>
              <ZahlungswegHinweisAktionen id={mietvertragId} />
            </p>
          )}
          {(mandat || zahlungsweg === "LASTSCHRIFT") && (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg border border-neutral-800 px-4 py-2.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">SEPA-Mandat</span>
              {mandat ? (
                <>
                  <MandatFeld label="Referenz" value={mandat.referenz ?? "–"} />
                  <MandatFeld label="Gläubiger-ID" value={mandat.glaeubigerId ?? "–"} />
                  <MandatFeld label="Unterschrift" value={mandat.datumText ?? "nicht erfasst"} />
                  <MandatFeld label="Kontoinhaber" value={mandat.kontoinhaber ?? "–"} />
                  <MandatFeld label="IBAN" value={mandat.iban ?? "–"} />
                </>
              ) : (
                <span className="text-xs text-amber-400">
                  Zahlt per Lastschrift, aber es ist kein Mandat erfasst — unter „Bearbeiten“ nachtragen.
                </span>
              )}
            </div>
          )}
          {notiz && (
            <div className="rounded-lg border border-neutral-800 px-4 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Notiz</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-white">{notiz}</p>
            </div>
          )}
          {(letzteErhoehungText || nachlassTexte.length > 0) && (
            <div className="text-xs text-neutral-400">
              {letzteErhoehungText && <p>{letzteErhoehungText} — Historie und Erfassung unter &bdquo;Bearbeiten&ldquo;.</p>}
              {nachlassTexte.map((t) => (
                <p key={t}>Mietnachlass {t}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MandatFeld({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-neutral-400">{label}</span> <span className="text-white">{value}</span>
    </span>
  );
}
