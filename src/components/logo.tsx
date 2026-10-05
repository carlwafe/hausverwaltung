/** Logo "Mietverwaltung Eutin": Haus mit sechs Fenstern im Kreis (nach Handskizze). */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="32" cy="32" r="29" />
      {/* Dach */}
      <path d="M13 29 32 14l19 15" />
      {/* Wände + Boden */}
      <path d="M17 27v21h30V27" />
      {/* Fenster 3 × 2 */}
      <g fill="currentColor" stroke="none">
        <rect x="21.5" y="30" width="5.5" height="5.5" rx="1" />
        <rect x="29.25" y="30" width="5.5" height="5.5" rx="1" />
        <rect x="37" y="30" width="5.5" height="5.5" rx="1" />
        <rect x="21.5" y="39" width="5.5" height="5.5" rx="1" />
        <rect x="29.25" y="39" width="5.5" height="5.5" rx="1" />
        <rect x="37" y="39" width="5.5" height="5.5" rx="1" />
      </g>
    </svg>
  );
}
