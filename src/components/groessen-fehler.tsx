/**
 * Warnung bei zu großer Datei mit Hinweis, wie man sie selbst verkleinert. Die App verkleinert
 * bewusst nicht selbst: ein PDF würde dabei zu Bildern, der Text wäre nicht mehr durchsuchbar.
 */
export function GroessenFehler({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="mt-2 text-sm">
      <p className="text-red-400">{text}</p>
      <p className="mt-1 text-xs text-neutral-500">
        Tipp (Mac): PDF in der Vorschau öffnen → Ablage → Exportieren… → Quarz-Filter „Dateigröße reduzieren“. Bilder
        in der Vorschau über Werkzeuge → Größe anpassen… verkleinern. Danach die neue Datei auswählen.
      </p>
    </div>
  );
}
