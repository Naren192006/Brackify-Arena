import type { ReactNode } from "react";

/**
 * Shared glass design-system primitives.
 * Server-safe (no hooks) so they can be used anywhere.
 */

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function GlassCard({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cx(
        "glass-panel rounded-2xl",
        interactive && "press-card hover:border-arena-accent/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon ? (
          <span className="glass-panel flex h-11 w-11 items-center justify-center rounded-xl text-arena-accent">
            {icon}
          </span>
        ) : null}
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-arena-text sm:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-arena-text-secondary">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cx(
        "flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-wider text-arena-text",
        className,
      )}
    >
      {icon ? <span className="text-arena-accent">{icon}</span> : null}
      {children}
    </h2>
  );
}

export function StatTile({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        "glass-panel press-card rounded-xl p-4",
        accent && "border-arena-accent/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-arena-text-muted">
          {label}
        </span>
        {icon ? (
          <span className={cx("opacity-70", accent ? "text-arena-accent" : "text-arena-text-secondary")}>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-2 font-display text-2xl font-bold text-arena-text">{value}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-panel flex flex-col items-center rounded-2xl px-6 py-14 text-center">
      {icon ? (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-arena-accent-soft text-arena-accent">
          {icon}
        </span>
      ) : null}
      <h3 className="font-display text-lg font-semibold text-arena-text">{title}</h3>
      {body ? <p className="mt-1 max-w-sm text-sm text-arena-text-secondary">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden="true" />;
}

/**
 * iOS-style toggle. Renders a real button so it is keyboard accessible.
 */
export function IosSwitch({
  checked,
  onToggle,
  label,
  disabled = false,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="ios-switch focus-visible:outline-2 focus-visible:outline-arena-accent"
    >
      <span className="ios-switch-thumb" />
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-arena-accent/30 border-t-arena-accent",
        className,
      )}
    />
  );
}

