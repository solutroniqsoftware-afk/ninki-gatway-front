export function CanonSvg({ azimut, azimutConsigne, firing }: { azimut: number; azimutConsigne: number; firing: boolean }) {
  return (
    <svg viewBox="0 0 200 200" className={firing ? "shake-recoil" : ""} width="100%" height="100%">
      <defs>
        <linearGradient id="barrel" x1="0" x2="1">
          <stop offset="0%" stopColor="#1A2545" />
          <stop offset="50%" stopColor="#3a5070" />
          <stop offset="100%" stopColor="#1A2545" />
        </linearGradient>
      </defs>
      {/* base radar circle */}
      <circle cx="100" cy="100" r="92" fill="none" stroke="var(--border-steel)" strokeDasharray="2 4" />
      <circle cx="100" cy="100" r="70" fill="none" stroke="var(--border-steel)" strokeDasharray="2 4" />
      <circle cx="100" cy="100" r="48" fill="rgba(0,212,255,0.04)" stroke="var(--border-steel)" />
      {azimutConsigne !== 0 && (
        <g style={{
          transform: `rotate(${azimutConsigne}deg)`,
          transformOrigin: '100px 100px',
          transition: 'transform 0.6s linear',
        }}>
          <line x1="100" y1="100" x2="100" y2="20" stroke="var(--text-disabled)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
        </g>
      )}
      {/* Bug #2 : transform SVG natif — évite les problèmes de transform-origin CSS sur SVG */}
      <g style={{
        transform: `rotate(${azimut}deg)`,
        transformOrigin: '100px 100px',
        transition: 'transform 0.6s linear',
      }}>
        {/* base */}
        <circle cx="100" cy="100" r="22" fill="#1A2545" stroke="#00D4FF" strokeWidth="1" />
        <circle cx="100" cy="100" r="6" fill="#00D4FF" />
        {/* barrel pointing up (north) */}
        <rect x="94" y="20" width="12" height="80" rx="2" fill="url(#barrel)" stroke="#00D4FF" strokeWidth="0.8" />
        <rect x="92" y="18" width="16" height="6" rx="1" fill="#7A9CC0" />
        {/* tracks */}
        <rect x="74" y="105" width="52" height="14" rx="2" fill="#0F1629" stroke="var(--border-steel)" />
        <rect x="74" y="120" width="52" height="14" rx="2" fill="#0F1629" stroke="var(--border-steel)" />
        {firing && (
          <g transform="translate(100 8)">
            <circle r="14" fill="rgba(255,184,0,0.9)" className="flame-flicker" />
            <circle r="22" fill="rgba(255,107,0,0.5)" />
            <circle r="30" fill="rgba(255,45,85,0.25)" />
          </g>
        )}
      </g>
      {/* azimut indicator outer */}
      <text x="100" y="14" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono" fill="var(--cyan-live)">N</text>
    </svg>
  );
}