// Small shared presentational bits: spinner, notices, empty states.

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`spinner ${className}`} role="status" aria-label="Working" />;
}

export function Notice({ kind = "info", children, className = "" }: { kind?: "ok" | "err" | "info"; children: React.ReactNode; className?: string }) {
  const styles = {
    ok: "bg-[#1f4a3a] text-[#bff5d2]",
    err: "bg-[#5a1f2a] text-[#ffd0c4]",
    info: "bg-[#2a2160] text-paper/90",
  }[kind];
  return (
    <p
      role={kind === "err" ? "alert" : "status"}
      className={`rounded-2xl border-[3px] border-[#1a0b2e] px-3 py-2 font-display text-sm tracking-wide shadow-[0_3px_0_#1a0b2e] ${styles} ${className}`}
    >
      {children}
    </p>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <QuietMoon />
      <h3 className="title-3d text-xl">{title}</h3>
      {children && <div className="max-w-md text-sm text-mist">{children}</div>}
      {action}
    </div>
  );
}

export function Loading({ label = "Padding over…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-mist">
      <Spinner /> {label}
    </div>
  );
}

export function QuietMoon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
      <circle cx="22" cy="22" r="16" fill="#fff3dc" opacity=".9" />
      <circle cx="29" cy="17" r="14" fill="#15123d" />
    </svg>
  );
}

export function Pill({ children, tone = "mist" }: { children: React.ReactNode; tone?: "mist" | "lantern" | "moss" | "ember" | "legend" }) {
  const t = {
    mist: "bg-[#2f2370] text-paper/85",
    lantern: "bg-[#ffc93c] text-[#1a0b2e]",
    moss: "bg-[#7ed6a0] text-[#1a0b2e]",
    ember: "bg-[#ff7a5c] text-[#1a0b2e]",
    legend: "bg-[#ffe08a] text-[#1a0b2e]",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border-2 border-[#1a0b2e] px-2 py-0.5 font-display text-xs tracking-wide ${t}`}>{children}</span>
  );
}

export function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-xs text-mist underline decoration-dotted underline-offset-4 hover:text-lantern">
      {children} ↗
    </a>
  );
}

/** A progress bar from the artist's UI kit: wooden frame, glossy gold (or green / ember) fill. */
export function Bar({ value, tone = "gold", className = "" }: { value: number; tone?: "gold" | "green" | "ember"; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`kit-bar ${tone === "gold" ? "" : tone} ${className}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      {v > 0 && <span style={{ width: `calc(${v}% + 18px)` }} />}
    </div>
  );
}
