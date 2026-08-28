import { supabase } from "@/lib/supabase/client";
import type { Tournament, TournamentRegistration } from "@/types/tournament";

const tournamentFields = "id,title,slug,game,mode,description,rules,max_teams,registration_open_at,registration_close_at,checkin_open_at,checkin_close_at,start_time,status,banner_url";

export async function createTournament(input: { title: string; slug: string; maxTeams: number; openAt: string; closeAt: string; startAt: string }) {
  const { data, error } = await supabase.rpc("create_tournament", { tournament_title: input.title, tournament_slug: input.slug, tournament_max_teams: input.maxTeams, tournament_open_at: input.openAt, tournament_close_at: input.closeAt, tournament_start_at: input.startAt });
  if (error) throw error;
  return data as string;
}

function withCount(row: Record<string, unknown>, registrations: number): Tournament {
  const maxTeams = Number(row.max_teams ?? 0);
  const rawStatus = String(row.status ?? "draft");
  const status = rawStatus === "full"
    ? (registrations < maxTeams && Date.now() >= new Date(String(row.registration_close_at)).getTime() ? "registration_closed" : "open")
    : rawStatus;
  return { ...row, status, registered_count: registrations } as Tournament;
}

export async function listTournaments(search = ""): Promise<Tournament[]> {
  let query = supabase.from("tournaments").select(`${tournamentFields},tournament_registrations(count)`).in("status", ["open", "registration_closed", "check_in", "ongoing", "completed"]).order("start_time", { ascending: true });
  if (search.trim()) query = query.ilike("title", `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) { console.error("[supabase] public tournament list failed", error); throw error; }
  const priority: Record<string, number> = { ongoing: 0, check_in: 1, registration_closed: 2, open: 3, completed: 4 };
  const tournaments = await Promise.all((data ?? []).map(async (row) => {
    const accepted = await supabase.from("tournament_registrations").select("id", { count: "exact", head: true }).eq("tournament_id", row.id).in("status", ["registered", "checked_in"]);
    if (accepted.error) { console.error("[supabase] tournament registration count failed", accepted.error); throw accepted.error; }
    return withCount(row as unknown as Record<string, unknown>, accepted.count ?? 0);
  }));
  return tournaments.sort((left, right) => (priority[left.status] ?? 99) - (priority[right.status] ?? 99) || new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
}

export async function getTournament(slug: string): Promise<Tournament | null> {
  const { data, error } = await supabase.from("tournaments").select(`${tournamentFields},tournament_registrations(count)`).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const accepted = await supabase.from("tournament_registrations").select("id", { count: "exact", head: true }).eq("tournament_id", data.id).in("status", ["registered", "checked_in"]);
  if (accepted.error) throw accepted.error;
  return withCount(data as unknown as Record<string, unknown>, accepted.count ?? 0);
}

export async function getTournamentRegistrations(tournamentId: string): Promise<TournamentRegistration[]> {
  const { data, error } = await supabase.from("tournament_registrations").select("id,status,team_id,checked_in,checked_in_at,seed,teams(id,name,tag,logo_url)").eq("tournament_id", tournamentId).in("status", ["registered", "checked_in"]).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TournamentRegistration[];
}

export async function getRegisteredTournaments(userId: string): Promise<Tournament[]> {
  const membership = await supabase.from("team_members").select("team_id").eq("user_id", userId);
  if (membership.error) throw membership.error;
  const teamIds = (membership.data ?? []).map((item) => item.team_id);
  if (!teamIds.length) return [];
  const { data, error } = await supabase.from("tournament_registrations").select(`id,status,team_id,checked_in,checked_in_at,seed,teams(id,name,tag,logo_url),tournaments(${tournamentFields})`).in("team_id", teamIds).in("status", ["registered", "checked_in"]).order("created_at", { ascending: false });
  if (error) throw error;
  const tournaments = (data ?? []).flatMap((row) => {
    const tournament = row.tournaments as unknown as Record<string, unknown> | null;
    return tournament ? [withCount({ ...tournament, registration_status: row.status, checked_in: row.checked_in, checked_in_at: row.checked_in_at, team_id: row.team_id }, 0)] : [];
  });
  if (!tournaments.length) return tournaments;
  const { data: brackets, error: bracketError } = await supabase.from("brackets").select("id,tournament_id,champion_team_id,matches(round_number,status)").in("tournament_id", tournaments.map((item) => item.id));
  if (bracketError) throw bracketError;
  const byTournament = new Map((brackets ?? []).map((bracket) => {
    const matches = (bracket.matches ?? []) as unknown as { round_number: number; status: string }[];
    const current = matches.filter((match) => match.status !== "completed").map((match) => match.round_number).sort((a, b) => a - b)[0] ?? null;
    return [bracket.tournament_id, { bracket_id: bracket.id, champion_team_id: bracket.champion_team_id, current_round: current }];
  }));
  return tournaments.map((tournament) => ({ ...tournament, ...(byTournament.get(tournament.id) ?? {}) }));
}
