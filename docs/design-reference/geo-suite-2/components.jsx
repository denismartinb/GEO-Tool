/* components.jsx — shared visual primitives for GEO Studio */
const { useState, useRef, useEffect } = React;

/* ---- Tooltip (info "i" with explanation) ---- */
function Tip({ children, w = 248 }) {
  return (
    <span className="tip-wrap">
      <span className="tip-trigger"><Icon name="info" size={14} /></span>
      <span className="tip-bubble" style={{ width: w }}>{children}</span>
    </span>
  );
}

/* ---- Sparkline ---- */
function Sparkline({ data, w = 92, h = 30, color = "var(--accent)", fill = true, invert = false }) {
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / rng) * (h - 4) - 2;
    return [x, y];
  });
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${w} ${h} L0 ${h} Z`;
  const id = "sg" + Math.random().toString(36).slice(2, 8);
  return (
    <svg width={w} height={h} className="spark" style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
}

/* ---- Radial gauge (hero GEO score) ---- */
function Gauge({ value, max = 100, size = 132, stroke = 13, label = "/ 100" }) {
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const start = 135, sweep = 270; // open-bottom arc
  const frac = Math.max(0, Math.min(1, value / max));
  const polar = (deg) => {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const arc = (fromDeg, toDeg) => {
    const [x1, y1] = polar(fromDeg), [x2, y2] = polar(toDeg);
    const large = (toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const col = value >= 70 ? "var(--pos)" : value >= 40 ? "var(--accent)" : "var(--warn)";
  const gid = "gg" + Math.round(value);
  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6d63f0" /><stop offset="100%" stopColor={col} />
          </linearGradient>
        </defs>
        <path d={arc(start, start + sweep)} fill="none" stroke="var(--surface-sunk)" strokeWidth={stroke} strokeLinecap="round" />
        <path d={arc(start, start + sweep * frac)} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round" />
      </svg>
      <div className="gauge-center">
        <div>
          <div className="gauge-num">{value}</div>
          <div className="gauge-cap">{label}</div>
        </div>
      </div>
    </div>
  );
}

/* ---- Delta indicator ---- */
function Delta({ value, suffix = "", invert = false }) {
  const positive = invert ? value < 0 : value > 0;
  const flat = value === 0;
  const cls = flat ? "flat" : positive ? "up" : "down";
  const arrow = flat ? null : <Icon name={value > 0 ? "arrUp" : "arrDown"} size={12} sw={2.2} />;
  const sign = value > 0 ? "+" : "";
  return <span className={"delta " + cls}>{arrow}{sign}{value}{suffix}</span>;
}

/* ---- Badge ---- */
function Badge({ tone = "neutral", icon, children }) {
  return <span className={"badge badge-" + tone}>{icon && <Icon name={icon} size={12} sw={2} />}{children}</span>;
}

/* ---- Entity favicon chip ---- */
function Fav({ ent, size = 24 }) {
  return <span className="fav" style={{ width: size, height: size, background: ent.color }}>{ent.initial}</span>;
}

/* ---- Avatar mini (for stacks) ---- */
function AvMini({ ent }) {
  return <span className="av-mini" style={{ background: ent.color }} title={ent.name}>{ent.initial}</span>;
}

/* ---- Impact/Effort/Confidence dot meter ---- */
function DotMeter({ n, max = 5, tone = "h" }) {
  return (
    <span className="ie-dots">
      {Array.from({ length: max }).map((_, i) =>
        <span key={i} className={"ie-dot " + (i < n ? "on-" + tone : "")} />)}
    </span>
  );
}

/* ---- Horizontal share bar ---- */
function SovBar({ value, color, track = 100 }) {
  return (
    <div className="sov-bar">
      <div className="sov-fill" style={{ width: (value / track * 100) + "%", background: color }} />
    </div>
  );
}

Object.assign(window, { Tip, Sparkline, Gauge, Delta, Badge, Fav, AvMini, DotMeter, SovBar });
