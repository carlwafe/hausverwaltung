import type { MandatBlattDaten } from "@/lib/sepa-mandat";

// Ein Blatt SEPA-Lastschriftmandat (A4). Farben und Maße stehen bewusst inline: Das Blatt ist Papier und darf
// weder von den Farbvariablen des hellen/dunklen Designs noch von beliebigen Tailwind-Werten abhängen.
const LINIE = "0.3mm solid #000";
const KLEIN = { fontSize: "8pt", color: "#333" } as const;

function Feld({ wert, beschriftung }: { wert?: string; beschriftung: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ borderBottom: LINIE, minHeight: "7mm", display: "flex", alignItems: "flex-end", paddingBottom: "0.5mm" }}>{wert}</div>
      <div style={{ ...KLEIN, marginTop: "0.8mm" }}>{beschriftung}</div>
    </div>
  );
}

const IBAN_GRUPPEN = [4, 4, 4, 4, 4, 2];

function Zeile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td style={{ width: "46mm", fontWeight: "bold", background: "#f2f2f2", border: "0.4mm solid #000", padding: "1.5mm 2.5mm", verticalAlign: "top" }}>{label}</td>
      <td style={{ border: "0.4mm solid #000", padding: "1.5mm 2.5mm", verticalAlign: "top" }}>{children}</td>
    </tr>
  );
}

export function MandatBlatt({ daten, letzte = false }: { daten: MandatBlattDaten; letzte?: boolean }) {
  const { glaeubiger } = daten;
  return (
    <div
      className="outline outline-1 outline-neutral-300 print:outline-none"
      style={{
        width: "210mm",
        height: "297mm",
        padding: "16mm 20mm 12mm",
        boxSizing: "border-box",
        overflow: "hidden",
        background: "#fff",
        color: "#000",
        fontFamily: "Helvetica, Arial, sans-serif",
        fontSize: "10pt",
        lineHeight: 1.35,
        breakAfter: letzte ? "auto" : "page",
      }}
    >
      <h1 style={{ fontSize: "15pt", fontWeight: "bold", margin: "0 0 1mm" }}>SEPA-Lastschriftmandat für wiederkehrende Zahlungen</h1>
      <p style={{ fontSize: "9.5pt", color: "#333", margin: "0 0 5mm" }}>Miete, Betriebskostenvorauszahlung und ggf. Umsatzsteuer</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4mm" }}>
        <tbody>
          <Zeile label="Zahlungsempfänger (Vermieterin)">{glaeubiger.zahlungsempfaenger}</Zeile>
          <Zeile label="Gläubiger (zieht die Lastschrift ein)">
            {glaeubiger.name}
            <br />
            {glaeubiger.anschrift}
          </Zeile>
          <Zeile label="Gläubiger-Identifikationsnummer">
            <strong>{glaeubiger.id}</strong>
          </Zeile>
          <Zeile label="Mandatsreferenz">
            <strong>{daten.referenz}</strong>
          </Zeile>
          <Zeile label="Mietobjekt">{daten.mietobjekt}</Zeile>
        </tbody>
      </table>

      <p style={{ margin: "0 0 3mm" }}>
        Ich ermächtige / Wir ermächtigen den Gläubiger {glaeubiger.name}, Zahlungen zugunsten der Vermieterin {glaeubiger.zahlungsempfaenger} von meinem /
        unserem Konto mittels SEPA-Basis-Lastschrift einzuziehen. Zugleich weise ich mein / weisen wir unser Kreditinstitut an, die von {glaeubiger.name} auf
        mein / unser Konto gezogenen SEPA-Basis-Lastschriften einzulösen.
      </p>

      <div style={{ border: "0.4mm solid #000", padding: "2.5mm 3mm", margin: "0 0 4mm", fontSize: "9.5pt" }}>
        <strong>Hinweis:</strong> Ich kann / Wir können innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages
        verlangen. Es gelten dabei die mit meinem / unserem Kreditinstitut vereinbarten Bedingungen.
      </div>

      <p style={{ margin: "0 0 3mm" }}>
        <strong>Einzug und Vorabankündigung:</strong> Die Miete wird jeweils zum dritten Werktag eines Monats in der geschuldeten Höhe eingezogen (Kaltmiete,
        Betriebskostenvorauszahlung und ggf. Umsatzsteuer laut Mietvertrag). Ändert sich der Betrag, etwa durch eine Mieterhöhung oder eine Anpassung der
        Betriebskostenvorauszahlung, wird der neue Betrag schriftlich angekündigt. Die Frist für die Vorabankündigung wird auf einen Kalendertag vor
        Fälligkeit verkürzt.
      </p>

      <h2 style={{ fontSize: "10.5pt", fontWeight: "bold", margin: "4mm 0 1.5mm" }}>Zahlungspflichtiger (Kontoinhaber)</h2>
      <div style={{ display: "flex", gap: "6mm", marginBottom: "1mm" }}>
        <Feld wert={daten.kontoinhaber} beschriftung="Vor- und Nachname (bei mehreren Kontoinhabern alle)" />
      </div>
      <div style={{ display: "flex", gap: "6mm", marginBottom: "1mm" }}>
        <Feld wert={daten.kontoinhaberAnschrift} beschriftung="Straße, Hausnummer, PLZ und Ort" />
      </div>

      <h2 style={{ fontSize: "10.5pt", fontWeight: "bold", margin: "4mm 0 1.5mm" }}>Kreditinstitut</h2>
      <div style={{ display: "flex", gap: "6mm", marginBottom: "1mm" }}>
        <Feld beschriftung="Name der Bank" />
        <Feld beschriftung="BIC (nur wenn die Bank keine deutsche ist)" />
      </div>
      <div style={{ ...KLEIN, marginTop: "2mm" }}>IBAN</div>
      <div style={{ display: "flex", marginTop: "1mm" }}>
        {IBAN_GRUPPEN.map((anzahl, g) => (
          <div key={g} style={{ display: "flex", marginRight: "2.5mm" }}>
            {Array.from({ length: anzahl }, (_, i) => (
              <span key={i} style={{ width: "6.2mm", height: "7mm", border: LINIE, marginRight: "-0.3mm", display: "inline-block" }} />
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "6mm", marginTop: "10mm" }}>
        <Feld beschriftung="Ort, Datum" />
        <Feld beschriftung="Unterschrift Kontoinhaber (bei mehreren: alle)" />
      </div>

      <p style={{ ...KLEIN, margin: "6mm 0 0" }}>
        Das Mandat gilt bis auf Widerruf und kann jederzeit mit Wirkung für künftige Einzüge widerrufen werden. Wird mit dem Mandat 36 Monate lang keine
        Lastschrift eingezogen, verfällt es. Ihre Daten werden ausschließlich zur Abwicklung des Mietverhältnisses verwendet.
      </p>
    </div>
  );
}
