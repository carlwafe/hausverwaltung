// Liest die Textebene eines PDFs lokal aus (pdf.js über unpdf) — Grundlage der Regel-Erkennung. Gescannte PDFs ohne
// Textebene liefern leere Seiten; Bilder werden hier nicht gelesen.
import { extractText, getDocumentProxy } from "unpdf";

/** Text je Seite (Zeilenumbrüche erhalten). Wirft bei defekten oder passwortgeschützten PDFs. */
export async function leseTextProSeite(inhalt: Buffer): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(inhalt));
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}
