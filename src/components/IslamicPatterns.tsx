import React from "react";

/**
 * Reusable Mathematics geometric ornament SVG components.
 */

/** Math function curve shape used as decorative section frames */
export const IslamicArch = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 200 120" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10 100 Q60 10 100 60 T190 20"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
    <path
      d="M10 110 Q60 20 100 70 T190 30"
      stroke="currentColor"
      strokeWidth="0.8"
      strokeDasharray="4 4"
      fill="none"
    />
  </svg>
);

/** Mathematics Symbol Badge (Pi / Math Symbol) - replacing star motif */
export const EightPointStar = ({ className = "", size = 32, style }: { className?: string; size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    <path
      d="M30 35 H70 M42 35 V70 M58 35 Q58 65 68 70"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Mathematics geometric grid pattern for backgrounds */
export const IslamicPattern = ({ className = "" }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80" fill="none">
    <g stroke="currentColor" strokeWidth="0.5" opacity="0.1">
      <circle cx="40" cy="40" r="30" />
      <line x1="10" y1="40" x2="70" y2="40" />
      <line x1="40" y1="10" x2="40" y2="70" />
      <line x1="18.79" y1="18.79" x2="61.21" y2="61.21" />
      <line x1="18.79" y1="61.21" x2="61.21" y2="18.79" />
    </g>
  </svg>
);

/** Math Sigma motif */
export const CrescentStar = ({ className = "", size = 32, style }: { className?: string; size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M70 25 H30 L55 50 L30 75 H70"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Mathematics section divider with clean symbols */
export const IslamicDivider = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center justify-center gap-3 ${className}`}>
    <div className="h-px flex-1 max-w-24 bg-border/60" />
    <span className="text-xs font-bold text-primary/40">∑</span>
    <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
    <span className="text-xs font-bold text-accent/60">π</span>
    <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
    <span className="text-xs font-bold text-primary/40">√</span>
    <div className="h-px flex-1 max-w-24 bg-border/60" />
  </div>
);
