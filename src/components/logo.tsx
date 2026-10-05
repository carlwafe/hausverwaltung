/**
 * Logo "Mietverwaltung Eutin": Haus mit sechs Fenstern im Kreis. Maße (Strichstärke 52, Fenstergröße
 * und -abstand, Dachüberstand) sind der Handskizze nachgemessen, daher das große viewBox. Dach und
 * Wände sind gefüllte Formen mit kleinen Eckenradien außen (innen scharf) statt Linien — Linien
 * können nur voll rund oder ganz spitz verbinden.
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="114 167 1460 1460"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <circle cx="844" cy="897" r="665" fill="none" stroke="currentColor" strokeWidth="52" />
      {/* Dach mit Überstand */}
      <path d="M394.5 726.2Q388.0 716.1 398.1 709.6L837.5 428.3Q844.0 424.1 850.5 428.3L1289.9 709.6Q1300.0 716.1 1293.5 726.2L1278.5 749.8Q1272.0 759.9 1261.9 753.4L844.0 485.9L426.1 753.4Q416.0 759.9 409.5 749.8Z" />
      {/* Wände + Boden */}
      <path d="M454.0 700.0Q442.0 700.0 442.0 712.0L442.0 1249.0Q442.0 1261.0 454.0 1261.0L1234.0 1261.0Q1246.0 1261.0 1246.0 1249.0L1246.0 712.0Q1246.0 700.0 1234.0 700.0L1206.0 700.0Q1194.0 700.0 1194.0 712.0L1194.0 1209.0L494.0 1209.0L494.0 712.0Q494.0 700.0 482.0 700.0Z" />
      {/* Fenster 3 × 2 */}
      <rect x="584" y="768" width="98" height="102" rx="10" />
      <rect x="796" y="768" width="98" height="102" rx="10" />
      <rect x="1006" y="768" width="98" height="102" rx="10" />
      <rect x="584" y="1005" width="98" height="102" rx="10" />
      <rect x="796" y="1005" width="98" height="102" rx="10" />
      <rect x="1006" y="1005" width="98" height="102" rx="10" />
    </svg>
  );
}
