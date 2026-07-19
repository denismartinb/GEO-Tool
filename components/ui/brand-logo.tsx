/**
 * GenScore brand logo (BRAND-1/BRAND-2).
 *
 * Canonical source of the mark is `public/brand/genscore-mark.svg`; this
 * component inlines the same paths so headers render crisp at any size
 * without an extra asset request. Used across the sidebar, marketing nav/
 * footer and auth headers (see docs/brand/brand-guidelines.md).
 */

const INK = "#0f1729";
const ACCENT = "#4f46e5";
const ACCENT_ON_DARK = "#818cf8";

type BrandMarkProps = {
  size?: number;
  /** Use the white/soft-indigo variant for dark backgrounds. */
  onDark?: boolean;
};

export function BrandMark({ size = 28, onDark = false }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 38 24 A 14 14 0 1 1 31 11.88 M 26 24 L 38 24"
        fill="none"
        stroke={onDark ? "#ffffff" : INK}
        strokeWidth={6.5}
        strokeLinecap="round"
      />
      <circle cx="36.12" cy="17" r="3.4" fill={onDark ? ACCENT_ON_DARK : ACCENT} />
    </svg>
  );
}

type BrandLogoProps = BrandMarkProps & {
  /** Wordmark font size in px; the mark scales proportionally. */
  textSize?: number;
};

export function BrandLogo({ size = 26, textSize = 17, onDark = false }: BrandLogoProps) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.32) }}>
      <BrandMark size={size} onDark={onDark} />
      <span
        style={{
          fontWeight: 800,
          fontSize: textSize,
          letterSpacing: "-0.015em",
          lineHeight: 1,
          color: onDark ? "#ffffff" : INK
        }}
      >
        GenScore
      </span>
    </span>
  );
}
