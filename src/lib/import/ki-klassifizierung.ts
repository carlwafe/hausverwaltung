// KI-Zweitmeinung für Import-Zeilen, die die Regeln (buchung-klassifizierung.ts) nicht sicher
// zuordnen. Liefert nur Vorschläge; gebucht wird erst nach Bestätigung durch den Nutzer.
import Anthropic from "@anthropic-ai/sdk";

export const KI_MODELL = "claude-haiku-4-5-20251001";
const BATCH_GROESSE = 20;

export type KiEingabeZeile = {
  rowNumber: number;
  datum: string | null;
  betrag: number | null;
  name: string;
  verwendungszweck: string;
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
- Erfinde nichts: Ist etwas unklar, setze das Feld auf null, konfidenz "niedrig" und erkläre im Kommentar kurz, was fehlt. IDs und Codes nur aus den gelieferten Listen.
- Kommentar: ein Satz, max. ~140 Zeichen, nenne den entscheidenden Anhaltspunkt.`;

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
              konfidenz: { type: "string", enum: ["hoch", "mittel", "niedrig"] },
              kommentar: { type: "string" },
            },
            required: ["rowNumber", "buchungsartCode", "kostenartId", "mietvertragId", "jahr", "konfidenz", "kommentar"],
          },
        },
      },
      required: ["zeilen"],
    },
  };

  const batches: KiEingabeZeile[][] = [];
  for (let i = 0; i < zeilen.length; i += BATCH_GROESSE) batches.push(zeilen.slice(i, i + BATCH_GROESSE));

  const ergebnisse = await Promise.all(
    batches.map(async (batch) => {
      const antwort = await client.messages.create({
        model: KI_MODELL,
        max_tokens: 4096,
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
            content: `Klassifiziere diese Zeilen:\n${JSON.stringify(
              batch.map((z) => ({
                rowNumber: z.rowNumber,
                datum: z.datum,
                betrag: z.betrag,
                empfaengerOderAbsender: schwaerze(z.name),
                verwendungszweck: schwaerze(z.verwendungszweck),
              })),
            )}`,
          },
        ],
      });
      const block = antwort.content.find((b) => b.type === "tool_use");
      const roh = (block && block.type === "tool_use" ? (block.input as { zeilen?: KiVorschlag[] }).zeilen : null) ?? [];
      return roh;
    }),
  );

  const erlaubteRows = new Set(zeilen.map((z) => z.rowNumber));
  return ergebnisse
    .flat()
    .filter((v) => erlaubteRows.has(v.rowNumber))
    .map((v) => ({
      rowNumber: v.rowNumber,
      buchungsartCode: v.buchungsartCode && gueltigeCodes.has(v.buchungsartCode) ? v.buchungsartCode : null,
      kostenartId: v.kostenartId && gueltigeKostenarten.has(v.kostenartId) ? v.kostenartId : null,
      mietvertragId: v.mietvertragId && gueltigeVertraege.has(v.mietvertragId) ? v.mietvertragId : null,
      jahr: typeof v.jahr === "number" && v.jahr >= 2000 && v.jahr <= 2100 ? v.jahr : null,
      konfidenz: v.konfidenz === "hoch" || v.konfidenz === "mittel" ? v.konfidenz : "niedrig",
      kommentar: String(v.kommentar ?? "").slice(0, 300),
    }));
}
