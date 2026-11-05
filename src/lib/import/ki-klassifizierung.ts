// KI-Zweitmeinung für Import-Zeilen: entweder für Zeilen, die die Regeln (buchung-klassifizierung.ts) nicht sicher
// zuordnen („Offene Zeilen mit KI prüfen“), oder als Prüfung der zum Import ausgewählten Zeilen samt Mietperiode
// („Ausgewählte mit KI prüfen“, Zeilen mit `aktuell`). Liefert nur Vorschläge; gebucht wird erst nach Bestätigung durch den Nutzer.
import Anthropic from "@anthropic-ai/sdk";

export const KI_MODELL = "claude-haiku-4-5-20251001";
const BATCH_GROESSE = 20;

export type KiEingabeZeile = {
  rowNumber: number;
  datum: string | null;
  betrag: number | null;
  name: string;
  verwendungszweck: string;
  // Nur bei „Ausgewählte mit KI prüfen“: die Zuordnung, die importiert würde — die KI bestätigt oder widerspricht.
  aktuell?: {
    buchungsartCode: string;
    mietvertragId: string | null;
    // „MM/JJJJ“, nur bei Mietzahlungen.
    periode: string | null;
    kostenartId: string | null;
    jahr: number | null;
    // Begründung der Regel für die Mietperiode (z.B. „Eingang am Monatsende — für den Folgemonat vorgeschlagen“).
    regelHinweis: string | null;
  } | null;
  // Bisherige Mietzahlungen des zugeordneten Vertrags, z.B. „28.10.2026 550,00 € → 11/2026“ (älteste zuerst).
  verlauf?: string[];
  // Aktuelle Warmmiete (Kalt + NK) des zugeordneten Vertrags.
  sollMiete?: number | null;
};

export type KiKontext = {
  buchungsarten: { code: string; bezeichnung: string }[];
  kostenarten: { id: string; name: string; umlagefaehig: boolean }[];
  mietvertraege: { id: string; label: string }[];
};

export type KiVorschlag = {
  rowNumber: number;
  buchungsartCode: string | null;
  kostenartId: string | null;
  mietvertragId: string | null;
  jahr: number | null;
  // Mietperiode, nur bei MIETZAHLUNG.
  periodeJahr: number | null;
  periodeMonat: number | null;
  // Nur im Prüfmodus (Zeile mit „aktuell“): true = Zuordnung stimmt, false = Widerspruch (Felder = Korrektur).
  passt: boolean | null;
  konfidenz: "hoch" | "mittel" | "niedrig";
  kommentar: string;
};

// IBANs/BICs gehören nicht zur Klassifizierung und werden nicht übertragen.
function schwaerze(text: string): string {
  return text
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, "[IBAN]")
    .replace(/\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g, (m) => (/^[A-Z]+$/.test(m) && m.length === 8 ? "[BIC]" : m));
}

const SYSTEM_PROMPT = `Du klassifizierst Kontoauszugszeilen für die Verwaltung eines Mietobjekts (Eutin, ~63 Einheiten).
Für jede Zeile schlägst du Buchungsart, ggf. Kostenart bzw. Mietvertrag und das Kostenjahr vor und begründest in einem kurzen deutschen Satz.

Regeln:
- Betrag mit Bankvorzeichen: positiv = Eingang, negativ = Ausgang.
- MIETZAHLUNG: Eingang eines Mieters (Mietvertrag aus Name/Verwendungszweck ableiten, nur wenn eindeutig). Negativer Betrag mit "RUECKBELASTUNG" = Rücklastschrift, ebenfalls MIETZAHLUNG.
- KOSTENPOSITION: Ausgaben für Handwerker, Versorger, Versicherung, Verwaltung usw. (auch Gutschriften davon). Kostenart aus der Liste wählen.
- Versorger (Stadtwerke): Der Verwendungszweck nennt oft die falsche Sparte ("Allgemeinstrom + Wasser", "Wasser + Gas"). Bei Unsicherheit kein Kostenart-Vorschlag, im Kommentar darauf hinweisen.
- Kostenjahr: normalerweise das Jahr des Buchungsdatums. Nur bei klarem Hinweis auf das direkte Vorjahr im Text (z.B. "Rauchwarnmelder 2022" in 2023, Jahresabrechnung "RNr." im ersten Halbjahr ohne "Abschlag") das Vorjahr. Sonst null.
- NEBENKOSTENAUSGLEICH: Auszahlung/Nachzahlung einer Betriebskostenabrechnung an/von einem Mieter. KAUTION_*: Kautionseinzahlung/-auszahlung/-anlage.
- Mietperiode (nur MIETZAHLUNG, Feld "periode" als "MM/JJJJ", sonst null): der Monat, für den die Miete gedacht ist — nicht unbedingt der Monat des Eingangs.
  1. Nennt der Verwendungszweck einen Monat ("Miete Januar", "Monatsmiete März 2024", "11.25 MIETE+BK", Lastschrift-Referenz "2000.903-11.25" = 11/2025), gilt dieser. Mehrere Monate: der älteste, im Kommentar auf Aufteilen hinweisen. Ausnahme: der genannte frühere Monat ist laut Verlauf schon bezahlt (vermutlich Tippfehler/alter Dauerauftragstext).
  2. Eingang ab etwa dem 25. eines Monats ohne Monatsangabe: Folgemonat (Jobcenter/Bundesagentur und viele Daueraufträge zahlen am Monatsende für den nächsten Monat). Zahlt der Mieter laut Verlauf regelmäßig am Monatsende für den Folgemonat, gilt das schon ab dem 20.
  3. Ausnahme zu 2: Ist laut Verlauf der laufende Monat noch unbezahlt, während der Mieter sonst pünktlich im Monat zahlt, ist es die verspätete Miete des laufenden Monats.
  4. Sonst der Monat des Buchungsdatums. Rücklastschrift (negativ): Monat der zurückgegebenen Zahlung, meist der Buchungsmonat.
  Nutze den Verlauf (Datum Betrag → Periode) und die Sollmiete, um Lücken und doppelt belegte Monate zu erkennen; Zeilen desselben Mieters in dieser Liste zählen mit.
- Prüfmodus: Hat eine Zeile "aktuell", prüfe genau diese Zuordnung (Buchungsart, Mietvertrag, Kostenart, Kostenjahr, Mietperiode). passt=true, wenn sie stimmt oder du keinen konkreten Gegengrund hast; dann gib die Werte von "aktuell" zurück. passt=false nur mit konkretem Anhaltspunkt; dann gib die vollständige korrigierte Zuordnung zurück (unveränderte Felder wiederholen) und nenne im Kommentar, was abweicht und warum. Ohne "aktuell": passt=null.
- Erfinde nichts: Ist etwas unklar, setze das Feld auf null, konfidenz "niedrig" und erkläre im Kommentar kurz, was fehlt. IDs und Codes nur aus den gelieferten Listen.
- Kommentar: ein Satz, max. ~160 Zeichen, nenne den entscheidenden Anhaltspunkt.`;

// Parallelität der Batches: der erste läuft allein (legt den Prompt-Cache für den Kontext an), danach höchstens so viele
// gleichzeitig — schont das Rate-Limit des API-Keys bei großen Auswahlen.
const PARALLELE_BATCHES = 4;

function parsePeriode(text: unknown): { jahr: number; monat: number } | null {
  const m = typeof text === "string" ? /^(\d{1,2})\/(\d{4})$/.exec(text.trim()) : null;
  if (!m) return null;
  const monat = Number(m[1]);
  const jahr = Number(m[2]);
  return monat >= 1 && monat <= 12 && jahr >= 2000 && jahr <= 2100 ? { jahr, monat } : null;
}

async function mitBegrenzung<T, R>(eintraege: T[], grenze: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const ergebnisse: R[] = new Array(eintraege.length);
  let naechster = 0;
  async function arbeite() {
    while (naechster < eintraege.length) {
      const i = naechster++;
      ergebnisse[i] = await fn(eintraege[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(grenze, eintraege.length) }, arbeite));
  return ergebnisse;
}

export async function klassifiziereMitKi(
  zeilen: KiEingabeZeile[],
  kontext: KiKontext,
): Promise<KiVorschlag[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt");
  const client = new Anthropic({ apiKey });

  const gueltigeCodes = new Set(kontext.buchungsarten.map((b) => b.code));
  const gueltigeKostenarten = new Set(kontext.kostenarten.map((k) => k.id));
  const gueltigeVertraege = new Set(kontext.mietvertraege.map((m) => m.id));

  const kontextText = [
    "BUCHUNGSARTEN (code: Bezeichnung):",
    ...kontext.buchungsarten.map((b) => `${b.code}: ${b.bezeichnung}`),
    "",
    "KOSTENARTEN (id | Name):",
    ...kontext.kostenarten.map((k) => `${k.id} | ${k.name}${k.umlagefaehig ? "" : " (nicht umlagefähig)"}`),
    "",
    "MIETVERTRÄGE (id | Mieter, Einheit):",
    ...kontext.mietvertraege.map((m) => `${m.id} | ${m.label}`),
  ].join("\n");

  const tool: Anthropic.Tool = {
    name: "melde_klassifizierung",
    description: "Meldet den Vorschlag für jede übergebene Zeile.",
    input_schema: {
      type: "object",
      properties: {
        zeilen: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rowNumber: { type: "integer" },
              buchungsartCode: { type: ["string", "null"] },
              kostenartId: { type: ["string", "null"] },
              mietvertragId: { type: ["string", "null"] },
              jahr: { type: ["integer", "null"] },
              periode: { type: ["string", "null"], description: "Mietperiode als MM/JJJJ, nur bei MIETZAHLUNG" },
              passt: { type: ["boolean", "null"], description: "Nur im Prüfmodus: stimmt die Zuordnung „aktuell“?" },
              konfidenz: { type: "string", enum: ["hoch", "mittel", "niedrig"] },
              kommentar: { type: "string" },
            },
            required: ["rowNumber", "buchungsartCode", "kostenartId", "mietvertragId", "jahr", "periode", "passt", "konfidenz", "kommentar"],
          },
        },
      },
      required: ["zeilen"],
    },
  };

  const batches: KiEingabeZeile[][] = [];
  for (let i = 0; i < zeilen.length; i += BATCH_GROESSE) batches.push(zeilen.slice(i, i + BATCH_GROESSE));

  const fuehreAus = async (batch: KiEingabeZeile[]) => {
    const antwort = await client.messages.create({
      model: KI_MODELL,
      max_tokens: 8192,
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        // Kontext identisch für alle Batches -> Prompt-Caching
        { type: "text", text: kontextText, cache_control: { type: "ephemeral" } },
      ],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: `Klassifiziere diese Zeilen (Zeilen mit "aktuell": Zuordnung prüfen):\n${JSON.stringify(
            batch.map((z) => ({
              rowNumber: z.rowNumber,
              datum: z.datum,
              betrag: z.betrag,
              empfaengerOderAbsender: schwaerze(z.name),
              verwendungszweck: schwaerze(z.verwendungszweck),
              ...(z.aktuell
                ? {
                    aktuell: {
                      buchungsartCode: z.aktuell.buchungsartCode,
                      mietvertragId: z.aktuell.mietvertragId,
                      periode: z.aktuell.periode,
                      kostenartId: z.aktuell.kostenartId,
                      jahr: z.aktuell.jahr,
                      regelHinweis: z.aktuell.regelHinweis ? String(z.aktuell.regelHinweis).slice(0, 200) : null,
                    },
                  }
                : {}),
              ...(z.verlauf?.length ? { verlaufMietzahlungen: z.verlauf.slice(-8).map((v) => String(v).slice(0, 60)) } : {}),
              ...(typeof z.sollMiete === "number" ? { sollMiete: z.sollMiete } : {}),
            })),
          )}`,
        },
      ],
    });
    const block = antwort.content.find((b) => b.type === "tool_use");
    const roh = (block && block.type === "tool_use" ? (block.input as { zeilen?: RohVorschlag[] }).zeilen : null) ?? [];
    return roh;
  };
  const ergebnisse =
    batches.length === 0
      ? []
      : [await fuehreAus(batches[0]), ...(await mitBegrenzung(batches.slice(1), PARALLELE_BATCHES, fuehreAus))];

  const erlaubteRows = new Set(zeilen.map((z) => z.rowNumber));
  const imPruefmodus = new Set(zeilen.filter((z) => z.aktuell).map((z) => z.rowNumber));
  return ergebnisse
    .flat()
    .filter((v) => erlaubteRows.has(v.rowNumber))
    .map((v) => {
      const buchungsartCode = v.buchungsartCode && gueltigeCodes.has(v.buchungsartCode) ? v.buchungsartCode : null;
      const periode = buchungsartCode === "MIETZAHLUNG" ? parsePeriode(v.periode) : null;
      return {
        rowNumber: v.rowNumber,
        buchungsartCode,
        kostenartId: v.kostenartId && gueltigeKostenarten.has(v.kostenartId) ? v.kostenartId : null,
        mietvertragId: v.mietvertragId && gueltigeVertraege.has(v.mietvertragId) ? v.mietvertragId : null,
        jahr: typeof v.jahr === "number" && v.jahr >= 2000 && v.jahr <= 2100 ? v.jahr : null,
        periodeJahr: periode?.jahr ?? null,
        periodeMonat: periode?.monat ?? null,
        passt: imPruefmodus.has(v.rowNumber) && typeof v.passt === "boolean" ? v.passt : null,
        konfidenz: v.konfidenz === "hoch" || v.konfidenz === "mittel" ? v.konfidenz : "niedrig",
        kommentar: String(v.kommentar ?? "").slice(0, 300),
      };
    });
}

// Rohform der Tool-Antwort (vor der Prüfung gegen die gelieferten Listen).
type RohVorschlag = Omit<KiVorschlag, "periodeJahr" | "periodeMonat" | "passt"> & { periode?: unknown; passt?: unknown };
