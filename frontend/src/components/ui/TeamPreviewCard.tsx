import type { Team } from "@/types/arena";
import { GlowAvatar } from "@/components/ui/GlowAvatar";

export function TeamPreviewCard({ team, children }: { team: Team; children: React.ReactNode }) {
  const isCaptain = team.role === "captain";

  return (
    <article className="glass-card p-4 sm:p-5 transition-all duration-200">
      <div className="flex items-center gap-3.5 sm:gap-4">
        <GlowAvatar src={team.logo_url} label={team.name} large />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg sm:text-xl font-bold text-arena-text">
              {team.name}
            </h3>
            <span className="rounded-md border border-arena-accent bg-arena-bg-elevated px-2 py-0.5 font-mono text-xs font-semibold text-arena-accent shrink-0">
              [{team.tag}]
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                isCaptain
                  ? "border border-amber-400/30 bg-amber-400/10 text-amber-300"
                  : "border border-arena-border bg-arena-bg-elevated text-arena-text-secondary"
              }`}
            >
              {isCaptain ? "Captain" : "Squad Member"}
            </span>
            <span className="text-arena-text-muted text-[11px]">
              Active Roster
            </span>
          </div>
        </div>
      </div>
      {children}
    </article>
  );
}
