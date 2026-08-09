import { POS_COLOR, POS_BG } from "@/lib/types";

export function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-line bg-panel ${className}`}
    >
      {(title || subtitle) && (
        <header className="border-b border-line px-4 py-3">
          {title && (
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-chalk">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{subtitle}</p>
          )}
        </header>
      )}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function PosChip({ pos, size = "md" }: { pos: string; size?: "sm" | "md" }) {
  const pad = size === "sm" ? "px-1.5 py-[1px] text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-block rounded font-semibold tabular-nums ${pad}`}
      style={{ color: POS_COLOR[pos] ?? "var(--color-muted)", background: POS_BG[pos] }}
    >
      {pos}
    </span>
  );
}

/** A position sequence rendered as a row of round-numbered chips. */
export function SeqStrip({
  seq,
  picks,
  max = 16,
}: {
  seq: string[];
  picks?: number[];
  max?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {seq.slice(0, max).map((pos, i) => (
        <div
          key={i}
          className="flex min-w-[46px] flex-col items-center rounded border border-line px-1.5 py-1"
          style={{ background: POS_BG[pos] }}
          title={picks ? `Round ${i + 1} · pick ${picks[i]}` : `Round ${i + 1}`}
        >
          <span className="text-[9px] leading-none text-muted">R{i + 1}</span>
          <span
            className="mt-0.5 text-[12px] font-bold leading-none"
            style={{ color: POS_COLOR[pos] }}
          >
            {pos}
          </span>
          {picks && (
            <span className="mt-0.5 text-[9px] leading-none text-muted tabular-nums">
              {picks[i]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "good" | "bad" | "warn";
}) {
  const color =
    tone === "good"
      ? "var(--color-good)"
      : tone === "bad"
        ? "var(--color-bad)"
        : tone === "warn"
          ? "var(--color-warn)"
          : "var(--color-chalk)";
  return (
    <div className="rounded-lg border border-line bg-panel px-3.5 py-3">
      <div className="text-[10.5px] uppercase leading-tight tracking-[0.1em] text-muted">
        {label}
      </div>
      <div
        className="mt-1.5 text-[22px] font-semibold leading-none tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

/** Horizontal bar that reads left-negative / right-positive around a zero line. */
export function Diverging({
  value,
  max,
  width = 120,
}: {
  value: number;
  max: number;
  width?: number;
}) {
  const half = width / 2;
  const w = Math.min(Math.abs(value) / max, 1) * half;
  const pos = value >= 0;
  return (
    <span
      className="relative inline-block align-middle"
      style={{ width, height: 10 }}
      aria-hidden
    >
      <span
        className="absolute top-0 bottom-0"
        style={{ left: half - 0.5, width: 1, background: "var(--color-line)" }}
      />
      <span
        className="absolute top-[1px] bottom-[1px] rounded-[2px]"
        style={{
          left: pos ? half : half - w,
          width: w,
          background: pos ? "var(--color-good)" : "var(--color-bad)",
          opacity: 0.85,
        }}
      />
    </span>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-l-2 border-line pl-3 text-[12px] leading-relaxed text-muted">
      {children}
    </p>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-line px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted text-${align} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
  title,
  style,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`whitespace-nowrap px-2.5 py-1.5 text-[12.5px] text-${align} ${className}`}
      title={title}
      style={style}
    >
      {children}
    </td>
  );
}
