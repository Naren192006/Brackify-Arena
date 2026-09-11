"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getInvitations, getNotifications, getProfile, getRecentActivity, getTeams } from "@/lib/arena/data";
import { getTeamCurrentMatch } from "@/lib/matches/data";
import { getRegisteredTournaments } from "@/lib/tournaments/data";
import { supabase } from "@/lib/supabase/client";
import { invitationSchema, profileSchema, teamSchema } from "@/lib/validation/team";
import type { Profile, Team } from "@/types/arena";
import { TeamPreviewCard } from "@/components/ui/TeamPreviewCard";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";
import { LiquidInput } from "@/components/ui/LiquidInput";

type Props = { userId: string; email: string; metadata: Record<string, unknown> };

const card = "rounded-2xl border border-white/10 bg-arena-surface/80 p-4 sm:p-5 shadow-2xl shadow-black/10";

export function DashboardContent({ userId, email, metadata }: Props) {
  const queryClient = useQueryClient();
  const [editingProfile, setEditingProfile] = useState(false);
  const profileQuery = useQuery({ queryKey: ["profile", userId], queryFn: () => getProfile(userId) });
  const teamsQuery = useQuery({ queryKey: ["teams", userId], queryFn: () => getTeams(userId) });
  const currentTeamId = teamsQuery.data?.[0]?.id;
  const currentMatchQuery = useQuery({
    queryKey: ["current-match", currentTeamId],
    queryFn: () => (currentTeamId ? getTeamCurrentMatch(currentTeamId) : Promise.resolve(null)),
    enabled: Boolean(currentTeamId),
    refetchInterval: 10000,
    retry: false,
  });
  const invitationsQuery = useQuery({ queryKey: ["team-invitations", userId], queryFn: () => getInvitations(userId) });
  const notificationsQuery = useQuery({ queryKey: ["notifications", userId], queryFn: () => getNotifications(userId) });
  const activityQuery = useQuery({ queryKey: ["activity", userId], queryFn: () => getRecentActivity(userId) });
  const registeredQuery = useQuery({ queryKey: ["registered-tournaments", userId], queryFn: () => getRegisteredTournaments(userId) });
  const reputationQuery = useQuery({ queryKey: ["reputation-summary", userId], queryFn: async () => { const [reports, currentProfile] = await Promise.all([supabase.from("fair_play_reports").select("id,status,resolution").eq("reported_user_id", userId).in("status", ["open", "investigating", "resolved"]), supabase.from("profiles").select("trust_score").eq("id", userId).maybeSingle()]); if (reports.error) throw reports.error; if (currentProfile.error) throw currentProfile.error; return { trustScore: currentProfile.data?.trust_score ?? 50, activeReports: (reports.data ?? []).filter((report) => report.status === "open" || report.status === "investigating").length, warnings: (reports.data ?? []).filter((report) => report.resolution === "warning").length }; } });

  const profile = profileQuery.data;
  const name = profile?.display_name || (metadata.full_name as string | undefined) || (metadata.name as string | undefined) || email.split("@")[0];

  const saveProfile = useMutation({
    mutationFn: async (form: FormData) => {
      const parsed = profileSchema.parse(Object.fromEntries(form.entries()));
      const { data, error } = await supabase.from("profiles").update(parsed).eq("id", userId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Profile updated"); setEditingProfile(false); queryClient.invalidateQueries({ queryKey: ["profile", userId] }); },
    onError: (error: Error) => toast.error(error.message || "Could not update your profile"),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
      const upload = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upload.error) throw upload.error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const update = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", userId);
      if (update.error) throw update.error;
    },
    onSuccess: () => { toast.success("Avatar updated"); queryClient.invalidateQueries({ queryKey: ["profile", userId] }); },
    onError: (error: Error) => toast.error(error.message || "Could not upload avatar"),
  });

  const createTeam = useMutation({
    mutationFn: async (form: FormData) => {
      const { name: teamName } = teamSchema.parse({
        name: form.get("name"),
      });

      const tag = String(form.get("tag") ?? "")
        .trim()
        .toUpperCase();

      if (!/^[A-Z0-9]{3,6}$/.test(tag)) {
        throw new Error("Team tag must be 3–6 letters or numbers.");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Please log in again.");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in.");
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/teams`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            team_name: teamName,
            tag,
            captain_id: user.id,
            game: "valorant",
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.detail?.message || "Failed to create team.");
      }

      return result.team;
    },

    onSuccess: (newTeam) => {
      toast.success("Team created");
      if (newTeam && newTeam.id) {
        queryClient.setQueryData<Team[]>(["teams", userId], (old = []) => {
          const exists = old.some((t) => t.id === newTeam.id);
          if (exists) return old;
          const formatted: Team = {
            id: newTeam.id,
            name: newTeam.name || newTeam.team_name,
            tag: newTeam.tag,
            description: newTeam.description || "",
            logo_url: newTeam.logo_url || null,
            captain_id: newTeam.captain_id || userId,
            role: "captain",
          };
          return [formatted, ...old];
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["teams", userId] });
      void queryClient.refetchQueries({ queryKey: ["teams", userId] });
    },

    onError: (error: Error) =>
      toast.error(error.message || "Could not create team"),
  });

  const invitePlayer = useMutation({
    mutationFn: async ({ teamId, target }: { teamId: string; target: string }) => {
      const parsed = invitationSchema.parse({ target });
      const { error } = await supabase.rpc("invite_team_member", { target_team_id: teamId, target: parsed.target });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Invitation sent"); queryClient.invalidateQueries({ queryKey: ["team-invitations", userId] }); },
    onError: (error: Error) => toast.error(error.message || "Could not send invitation"),
  });

  const respond = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "accepted" | "declined" }) => {
      const { error } = await supabase.rpc("respond_to_team_invitation", { invitation_id: id, decision });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Invitation updated"); queryClient.invalidateQueries({ queryKey: ["team-invitations", userId] }); queryClient.invalidateQueries({ queryKey: ["teams", userId] }); },
    onError: (error: Error) => toast.error(error.message || "Could not update invitation"),
  });

  return (
    <div className="dashboard-liquid-shell mx-auto max-w-[1500px] px-4 py-6 sm:px-8 sm:py-12 lg:py-16">
      <section className="glass-card dashboard-hero mb-6 sm:mb-8 overflow-hidden p-4 sm:p-8">
        <p className="mb-2 text-xs sm:text-sm font-semibold uppercase tracking-[0.25em] text-arena-accent">Player command center</p>
        <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl font-bold text-white">Welcome back, {name}</h1>
        <p className="mt-2 sm:mt-3 max-w-2xl text-xs sm:text-sm text-arena-muted">Build your roster, keep your profile tournament-ready, and stay close to every Brackify Arena opportunity.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className={card}>
          <SectionTitle title="Profile summary" action={<button className="text-sm text-arena-accent hover:underline" onClick={() => setEditingProfile((value) => !value)}>{editingProfile ? "Close" : "Edit profile"}</button>} />
          {editingProfile ? <ProfileForm profile={profile} email={email} pending={saveProfile.isPending} avatarPending={uploadAvatar.isPending} onAvatar={(file) => uploadAvatar.mutate(file)} onSubmit={(form) => saveProfile.mutate(form)} /> : profileQuery.isPending ? <LoadingRows /> : <ProfileSummary profile={profile} name={name} email={email} metadata={metadata} />}
        </section>
        <section className={card}><SectionTitle title="Registered tournaments" />{registeredQuery.isLoading ? <LoadingRows /> : registeredQuery.data?.length ? <div className="space-y-3">{registeredQuery.data.map((tournament) => <RegisteredTournamentCard key={`${tournament.id}-${tournament.team_id}`} tournament={tournament} onUpdated={() => { void queryClient.invalidateQueries({ queryKey: ["registered-tournaments", userId] }); }} />)}</div> : <EmptyState title="No registrations yet" text="Register one of your teams for an open tournament." />}</section>
      </div>

      <section id="my-teams" className={`${card} liquid-section mt-8`}>
        <SectionTitle title="Tournament day" />
        {teamsQuery.isPending || currentMatchQuery.isPending ? <LoadingRows /> : currentMatchQuery.data ? <CurrentMatch match={currentMatchQuery.data} teamId={currentTeamId!} /> : <EmptyState title="No current match" text="Your next match will appear here once the bracket is ready." />}
      </section>

      <section className={`${card} mt-6`}><SectionTitle title="Fair play" /><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-arena-muted">Trust score</p><p className="mt-1 font-display text-2xl font-bold text-white">{reputationQuery.data?.trustScore ?? "—"}/100</p></div><div><p className="text-xs text-arena-muted">Active reports</p><p className="mt-1 font-display text-2xl font-bold text-white">{reputationQuery.data?.activeReports ?? "—"}</p></div><div><p className="text-xs text-arena-muted">Warnings</p><p className="mt-1 font-display text-2xl font-bold text-white">{reputationQuery.data?.warnings ?? "—"}</p></div></div></section>

      <section className={`${card} mt-6`}>
        <SectionTitle title="My teams" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="team-stack space-y-4">
            {teamsQuery.isLoading ? <LoadingRows /> : teamsQuery.data?.length ? teamsQuery.data.map((team) => <TeamCard key={team.id} team={team} onInvite={(target) => invitePlayer.mutate({ teamId: team.id, target })} />) : <EmptyState title="No teams yet" text="Create your first roster and start building your competitive identity." />}
          </div>
          <CreateTeamForm pending={createTeam.isPending} onSubmit={(form) => createTeam.mutate(form)} />
        </div>
        {invitationsQuery.data?.length ? <div className="mt-6 border-t border-white/10 pt-5"><h3 className="mb-3 font-display text-xl font-semibold text-white">Pending invitations</h3><div className="space-y-2">{invitationsQuery.data.map((invite) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.04] p-3" key={invite.id}><span className="text-sm text-arena-muted">You&apos;ve been invited to <strong className="text-white">{invite.teams?.name ?? "a team"}</strong></span><span className="flex gap-2"><button className="btn-primary px-3 py-1.5 text-xs" onClick={() => respond.mutate({ id: invite.id, decision: "accepted" })}>Accept</button><button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-arena-muted hover:text-white" onClick={() => respond.mutate({ id: invite.id, decision: "declined" })}>Decline</button></span></div>)}</div></div> : null}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={card}><SectionTitle title="Notifications" />{notificationsQuery.isPending ? <LoadingRows /> : <Feed items={notificationsQuery.data?.map((item) => ({ id: item.id, title: item.title, text: item.body ?? "You have a new Brackify Arena update." }))} empty="You're all caught up." />}</section>
        <section className={card}><SectionTitle title="Recent activity" />{activityQuery.isPending ? <LoadingRows /> : <Feed items={activityQuery.data?.map((item) => ({ id: item.id, title: "Activity", text: item.description }))} empty="Your recent activity will show here." />}</section>
      </div>
      <FloatingActionButton />
    </div>
  );
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) { return <div className="mb-4 sm:mb-5 flex items-center justify-between"><h2 className="font-display text-xl sm:text-2xl font-semibold text-white">{title}</h2>{action}</div>; }

function ProfileSummary({ profile, name, email, metadata }: { profile?: Profile | null; name: string; email: string; metadata: Record<string, unknown> }) {
  const avatar = profile?.avatar_url || (metadata.avatar_url as string | undefined) || (metadata.picture as string | undefined);
  return <div className="flex items-start gap-3 sm:gap-4"><Avatar src={avatar} label={name} /><div><p className="text-base sm:text-lg font-semibold text-white">{name}</p><p className="text-xs sm:text-sm text-arena-muted">{email}</p><p className="mt-2 sm:mt-3 text-xs sm:text-sm text-arena-muted">{profile?.riot_id || "Add your Riot ID"} · {profile?.region || "Region not set"}</p><p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-arena-muted">{profile?.bio || "Tell your teammates what you bring to the arena."}</p></div></div>;
}

function ProfileForm({ profile, email, pending, avatarPending, onAvatar, onSubmit }: { profile?: Profile | null; email: string; pending: boolean; avatarPending: boolean; onAvatar: (file: File) => void; onSubmit: (form: FormData) => void }) { return <form action={onSubmit} className="grid gap-3 sm:grid-cols-2"><label className="field sm:col-span-2">Avatar<input type="file" accept="image/png,image/jpeg,image/webp" className="input-field" disabled={avatarPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) onAvatar(file); }} />{avatarPending ? <span className="text-xs text-arena-accent">Uploading avatar…</span> : null}</label><label className="field">Display name<input name="display_name" defaultValue={profile?.display_name ?? email.split("@")[0]} /></label><label className="field">Username<input name="username" defaultValue={profile?.username ?? ""} /></label><label className="field">Riot ID<input name="riot_id" defaultValue={profile?.riot_id ?? ""} placeholder="Name#TAG" /></label><label className="field">Region<input name="region" defaultValue={profile?.region ?? ""} placeholder="AP / EU / NA" /></label><label className="field sm:col-span-2">Bio<textarea name="bio" defaultValue={profile?.bio ?? ""} rows={3} /></label><button className="btn-primary sm:col-span-2" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button></form>; }

function CreateTeamForm({ pending, onSubmit }: { pending: boolean; onSubmit: (form: FormData) => void }) { return <form id="create-team" action={onSubmit} className="liquid-card create-team-panel p-4 sm:p-6"><p className="text-xs uppercase tracking-[0.24em] text-arena-accent">New roster</p><h3 className="mt-1.5 sm:mt-2 font-display text-2xl sm:text-3xl font-semibold text-white">Create a team</h3><p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-arena-muted">You&apos;ll become captain and can invite players next.</p><div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4"><input name="name" required minLength={2} maxLength={40} placeholder="Team name" className="liquid-input w-full" /><input name="tag" required minLength={3} maxLength={6} placeholder="Team tag (3–6)" className="liquid-input w-full uppercase" /><textarea name="description" maxLength={240} placeholder="Description (optional)" rows={3} className="liquid-input w-full resize-none" /></div><button className="btn-primary liquid-shine mt-4 sm:mt-5 w-full" disabled={pending}>{pending ? "Creating…" : "Create team"}</button><div className="mt-3 sm:mt-4 flex flex-wrap gap-2 text-xs text-arena-muted"><span className="glass-badge">Captain access</span><span className="glass-badge">Up to 5 players</span><span className="glass-badge">Tag preview</span></div></form>; }

function TeamCard({ team, onInvite }: { team: Team; onInvite: (target: string) => void }) { const [target, setTarget] = useState(""); const [logoBusy, setLogoBusy] = useState(false); const isCaptain = team.role === "captain"; const upload = async (file: File) => { setLogoBusy(true); const path = `${team.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`; const { error } = await supabase.storage.from("team-logos").upload(path, file, { upsert: true, contentType: file.type }); if (!error) { const { data } = supabase.storage.from("team-logos").getPublicUrl(path); const update = await supabase.from("teams").update({ logo_url: data.publicUrl }).eq("id", team.id); if (update.error) toast.error(update.error.message); else toast.success("Team logo updated"); } else toast.error(error.message); setLogoBusy(false); }; return <TeamPreviewCard team={team}><div className="mt-5 flex items-center justify-between gap-3"><p className="text-sm text-arena-muted">{team.description || "Build your competitive identity."}</p><Link href={`/teams/${team.id}`} className="glass-badge shrink-0 text-arena-accent hover:border-cyan-300">View team</Link></div>{isCaptain ? <form className="team-invite mt-5 flex gap-2" action={(form) => { const value = String(form.get("target") ?? "").trim(); if (value) { onInvite(value); setTarget(""); } }}><div className="relative min-w-0 flex-1"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-arena-accent">⌕</span><LiquidInput name="target" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Invite by username or email" className="pl-10" /></div><button className="btn-primary rounded-full px-4 py-2 text-sm">Invite</button></form> : null}<div className="mt-4 flex flex-wrap items-center gap-3">{isCaptain ? <label className="cursor-pointer text-xs text-arena-accent hover:underline">{logoBusy ? "Uploading…" : "Update logo"}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={logoBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label> : null}<span className="text-xs text-arena-muted">Members and management available from View team.</span></div></TeamPreviewCard>; }

function Avatar({ src, label }: { src?: string | null; label: string }) { return src ? <img src={src} alt={`${label} avatar`} className="h-14 w-14 rounded-2xl object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/15 font-display text-xl font-bold text-arena-accent">{label.slice(0, 1).toUpperCase()}</div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="rounded-xl border border-dashed border-white/10 p-5 text-center"><p className="font-semibold text-white">{title}</p><p className="mt-1 text-sm text-arena-muted">{text}</p></div>; }
function LoadingRows() { return <div className="animate-pulse space-y-3"><div className="h-20 rounded-xl bg-white/5" /><div className="h-20 rounded-xl bg-white/5" /></div>; }
function Feed({ items, empty }: { items?: { id: string; title: string; text: string }[]; empty: string }) { return items?.length ? <div className="space-y-3">{items.map((item) => <div key={item.id} className="border-b border-white/5 pb-3 last:border-0"><p className="text-sm font-semibold text-white">{item.title}</p><p className="mt-1 text-sm text-arena-muted">{item.text}</p></div>)}</div> : <p className="text-sm text-arena-muted">{empty}</p>; }

function CurrentMatch({ match, teamId }: { match: import("@/types/match").Match; teamId: string }) {
  const opponentId = match.team_a_id === teamId ? match.team_b_id : match.team_a_id;
  const opponentQuery = useQuery({ queryKey: ["match-opponent", opponentId], queryFn: async () => { if (!opponentId) return null; const { data, error } = await supabase.from("teams").select("name,tag").eq("id", opponentId).maybeSingle(); if (error) throw error; return data; }, enabled: Boolean(opponentId) });
  const tournamentQuery = useQuery({ queryKey: ["match-tournament", match.tournament_id], queryFn: async () => { const { data, error } = await supabase.from("tournaments").select("slug").eq("id", match.tournament_id).maybeSingle(); if (error) throw error; return data; } });
  return <div className="rounded-xl bg-white/[0.04] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-arena-muted">Round {match.round_number} · Opponent</p><p className="mt-1 font-display text-xl font-semibold text-white">{opponentQuery.data?.name ?? "TBD"}{opponentQuery.data?.tag ? ` [${opponentQuery.data.tag}]` : ""}</p></div><span className="text-xs uppercase text-arena-accent">{match.status}</span></div>{tournamentQuery.data?.slug ? <Link href={`/tournaments/${tournamentQuery.data.slug}/matches/${match.id}`} className="btn-primary mt-4 inline-block px-4 py-2 text-sm">Report score</Link> : null}</div>;
}

function RegisteredTournamentCard({ tournament, onUpdated }: { tournament: import("@/types/tournament").Tournament; onUpdated: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const startTime = new Date(tournament.start_time).getTime();
  const countdown = now < startTime ? `Starts in ${formatCountdown(startTime - now)}` : "Tournament started";
  const status = tournament.registration_status === "registered" ? "Registered" : "Closed";
  return <div className="rounded-xl bg-white/[0.04] p-3"><div className="flex items-start justify-between gap-3"><Link href={`/tournaments/${tournament.slug}`} className="min-w-0 hover:underline"><p className="truncate font-semibold text-white">{tournament.title}</p><p className="mt-1 text-xs text-arena-muted">{tournament.game} · {tournament.status} · Starts {new Date(tournament.start_time).toLocaleDateString()}</p></Link><span className="shrink-0 text-xs uppercase text-arena-accent">{status}</span></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-arena-muted">{tournament.champion_team_id ? "Champion decided" : tournament.current_round ? `Round ${tournament.current_round}` : countdown}</span><span className="flex items-center gap-2">{tournament.bracket_id ? <Link href={`/tournaments/${tournament.slug}/bracket`} className="text-xs text-arena-accent hover:underline">View bracket</Link> : null}</span></div></div>;
}

function formatCountdown(milliseconds: number) { const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000)); const days = Math.floor(totalSeconds / 86400); const hours = Math.floor((totalSeconds % 86400) / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`; }