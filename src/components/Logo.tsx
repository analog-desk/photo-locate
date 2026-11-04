/** Varo’s Eye mark: an eye in a film frame, with a camera aperture for the iris. Black & orange. */
export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Varo’s Eye logo">
      <rect width="64" height="64" rx="14" fill="#0b0b0c" stroke="rgba(255,122,26,.35)" strokeWidth="1.5" />
      <g fill="#ff7a1a"><rect x="6.0" y="5" width="5" height="4.2" rx="1"/><rect x="15.6" y="5" width="5" height="4.2" rx="1"/><rect x="25.2" y="5" width="5" height="4.2" rx="1"/><rect x="34.8" y="5" width="5" height="4.2" rx="1"/><rect x="44.4" y="5" width="5" height="4.2" rx="1"/><rect x="54.0" y="5" width="5" height="4.2" rx="1"/><rect x="6.0" y="54.8" width="5" height="4.2" rx="1"/><rect x="15.6" y="54.8" width="5" height="4.2" rx="1"/><rect x="25.2" y="54.8" width="5" height="4.2" rx="1"/><rect x="34.8" y="54.8" width="5" height="4.2" rx="1"/><rect x="44.4" y="54.8" width="5" height="4.2" rx="1"/><rect x="54.0" y="54.8" width="5" height="4.2" rx="1"/></g>
<path d="M7 32C17 18 47 18 57 32C47 46 17 46 7 32Z" fill="none" stroke="#ff7a1a" strokeWidth="3" strokeLinejoin="round"/>
<circle cx="32" cy="32" r="10.5" fill="#ff7a1a"/>
<g stroke="#0b0b0c" strokeWidth="1.1" strokeLinecap="round"><line x1="36.25" y1="33.14" x2="37.28" y2="39.54"/><line x1="33.14" y1="36.25" x2="28.11" y2="40.34"/><line x1="28.89" y1="35.11" x2="22.84" y2="32.80"/><line x1="27.75" y1="30.86" x2="26.72" y2="24.46"/><line x1="30.86" y1="27.75" x2="35.89" y2="23.66"/><line x1="35.11" y1="28.89" x2="41.16" y2="31.20"/></g>
<polygon points="36.25,33.14 33.14,36.25 28.89,35.11 27.75,30.86 30.86,27.75 35.11,28.89" fill="#0b0b0c"/>
    </svg>
  );
}
