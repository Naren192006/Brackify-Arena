"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdminRegistrations } from "@/lib/admin/tournaments";
import { listManagedTournaments } from "@/lib/admin/roles";

type RegistrationWithTournament = { id: string; status: string; teamName: string; teamTag: string | null; tournamentTitle: string; tournamentSlug: string; createdAt: string };
export function RegistrationQueue() {
  const tournaments = useQuery({ queryKey: ["registration-queue-tournaments"], queryFn: listManagedTournaments });
  const registrations = useQuery({
    queryKey: ["registration-queue", tournaments.data?.map((tournament) => tournament.id).join(",")],
    enabled: Boolean(tournaments.data),
    queryFn: async (): Promise<RegistrationWithTournament[]> => {
      const managed = tournaments.data ?? [];
      const rows = await Promise.all(managed.map(async (tournament) => {
        const items = await getAdminRegistrations(tournament.id);
        return items.map((item) => ({ id: item.id, status: item.status, teamName: item.teams?.name ?? "Team", teamTag: item.teams?.tag ?? null, tournamentTitle: tournament.title, tournamentSlug: tournament.slug, createdAt: item.created_at }));
      }));
      return rows.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
  });
  return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><p className="text-sm uppercase tracking-[0.25em] text-arena-accent">Manage</p><h1 className="mt-2 font-display text-4xl font-bold text-white">Registrations</h1><p className="mt-2 text-arena-muted">Registrations from tournaments you are authorized to manage.</p><section className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-arena-surface/80"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-white/10 text-arena-muted"><tr>{["Tournament", "Team", "Status", "Registered", "Open"].map((heading) => <th className="px-4 py-3 font-medium" key={heading}>{heading}</th>)}</tr></thead><tbody>{tournaments.isLoading || registrations.isLoading ? <tr><td className="px-4 py-6 text-arena-muted" colSpan={5}>Loading registrations…</td></tr> : registrations.data?.length ? registrations.data.map((registration) => <tr className="border-b border-white/5" key={registration.id}><td className="px-4 py-4 text-white">{registration.tournamentTitle}</td><td className="px-4 py-4 text-white">{registration.teamName} <span className="text-arena-accent">[{registration.teamTag ?? "—"}]</span></td><td className="px-4 py-4 uppercase text-arena-accent">{registration.status.replaceAll("_", " ")}</td><td className="px-4 py-4 text-arena-muted">{new Date(registration.createdAt).toLocaleString()}</td><td className="px-4 py-4"><a className="text-arena-accent hover:underline" href={`/admin/tournaments/${registration.tournamentSlug}`}>View tournament</a></td></tr>) : <tr><td className="px-4 py-8 text-center text-arena-muted" colSpan={5}>No registrations found.</td></tr>}</tbody></table></section></main>;
}
