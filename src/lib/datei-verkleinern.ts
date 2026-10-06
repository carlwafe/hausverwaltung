// Verkleinert PDF- und Bilddateien komplett im Browser (nichts wird hochgeladen). Nur aus
// Client-Komponenten aufrufen: nutzt Canvas und lädt pdf.js/pdf-lib erst bei Bedarf nach.
//
// PDF: jede Seite wird als Bild gerendert und als JPEG in ein neues PDF gesetzt — gedacht für
// eingescannte Verträge/Schreiben. Dabei geht der Text als Text verloren (nicht mehr durchsuch-
// oder kopierbar). Bilder: auf kleinere Kantenlänge skaliert und als JPEG neu gespeichert.

export class VerkleinernFehler extends Error {}

export function istVerkleinerbar(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name) || /^image\/(jpeg|png|webp)$/.test(file.type);
}

const ohneEndung = (name: string) => name.replace(/\.[^.]+$/, "");

function canvasZuJpeg(canvas: HTMLCanvasElement, qualitaet: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new VerkleinernFehler("Bild konnte nicht erzeugt werden."))), "image/jpeg", qualitaet),
  );
}

// Stufen von „gut lesbar“ bis „klein“: Auflösung (Faktor auf 72 dpi) und JPEG-Qualität.
const PDF_STUFEN = [
  { scale: 1.5, qualitaet: 0.6 },
  { scale: 1.25, qualitaet: 0.5 },
  { scale: 1, qualitaet: 0.45 },
  { scale: 0.8, qualitaet: 0.4 },
];

async function verkleinerePdf(file: File, maxBytes: number): Promise<File> {
  const [pdfjs, { PDFDocument }] = await Promise.all([import("pdfjs-dist"), import("pdf-lib")]);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const aufgabe = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let pdf;
  try {
    pdf = await aufgabe.promise;
  } catch {
    void aufgabe.destroy();
    throw new VerkleinernFehler("Die PDF-Datei konnte nicht gelesen werden (beschädigt oder passwortgeschützt).");
  }

  let ergebnis: Uint8Array | null = null;
  try {
    for (const { scale, qualitaet } of PDF_STUFEN) {
      const neu = await PDFDocument.create();
      for (let nr = 1; nr <= pdf.numPages; nr++) {
        const seite = await pdf.getPage(nr);
        const basis = seite.getViewport({ scale: 1 });
        const ansicht = seite.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(ansicht.width);
        canvas.height = Math.ceil(ansicht.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new VerkleinernFehler("Der Browser unterstützt die Verkleinerung nicht.");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await seite.render({ canvasContext: ctx, canvas, viewport: ansicht }).promise;
        const jpeg = await neu.embedJpg(new Uint8Array(await (await canvasZuJpeg(canvas, qualitaet)).arrayBuffer()));
        neu.addPage([basis.width, basis.height]).drawImage(jpeg, { x: 0, y: 0, width: basis.width, height: basis.height });
        seite.cleanup();
        canvas.width = 0;
      }
      ergebnis = await neu.save();
      if (ergebnis.byteLength <= maxBytes) break;
    }
  } finally {
    void aufgabe.destroy();
  }

  if (!ergebnis || ergebnis.byteLength >= file.size) {
    throw new VerkleinernFehler("Die PDF-Datei lässt sich so nicht verkleinern.");
  }
  return new File([new Uint8Array(ergebnis)], `${ohneEndung(file.name)}-verkleinert.pdf`, { type: "application/pdf" });
}

const BILD_STUFEN = [
  { kante: 2400, qualitaet: 0.85 },
  { kante: 2000, qualitaet: 0.75 },
  { kante: 1600, qualitaet: 0.65 },
  { kante: 1200, qualitaet: 0.55 },
];

async function verkleinereBild(file: File, maxBytes: number): Promise<File> {
  let bild: ImageBitmap;
  try {
    bild = await createImageBitmap(file);
  } catch {
    throw new VerkleinernFehler("Das Bild konnte nicht gelesen werden.");
  }

  let ergebnis: Blob | null = null;
  for (const { kante, qualitaet } of BILD_STUFEN) {
    const faktor = Math.min(1, kante / Math.max(bild.width, bild.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bild.width * faktor));
    canvas.height = Math.max(1, Math.round(bild.height * faktor));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new VerkleinernFehler("Der Browser unterstützt die Verkleinerung nicht.");
    // Weißer Hintergrund, sonst wird Transparenz (PNG) im JPEG schwarz.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bild, 0, 0, canvas.width, canvas.height);
    ergebnis = await canvasZuJpeg(canvas, qualitaet);
    if (ergebnis.size <= maxBytes) break;
  }
  bild.close();

  if (!ergebnis || ergebnis.size >= file.size) throw new VerkleinernFehler("Das Bild lässt sich so nicht verkleinern.");
  return new File([ergebnis], `${ohneEndung(file.name)}.jpg`, { type: "image/jpeg" });
}

/** Verkleinert eine PDF- oder Bilddatei, bis sie (möglichst) unter `maxBytes` liegt. */
export async function verkleinereDatei(file: File, maxBytes: number): Promise<File> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return verkleinerePdf(file, maxBytes);
  return verkleinereBild(file, maxBytes);
}
