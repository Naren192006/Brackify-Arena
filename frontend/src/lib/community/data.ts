import { createClient } from "@/lib/supabase/server";
import type { PublicPlayer, PublicTeam, RankingRow } from "@/types/community";

export async function getPublicPlayer(username: string): Promise<PublicPlayer | null> {
  const client = await createClient();
  const { data, error } = await client.from("profiles").select("id,username,display_name,avatar_url,riot_id,region,bio,favorite_game,trust_score,current_rank,created_at").eq("username", username).maybeSingle();
  if (error) throw error;
  return data ? { ...data, joined_at: data.created_at } as PublicPlayer : null;
}

export async function getPublicTeam(slugOrId: string): Promise<PublicTeam | null> {
  const client = await createClient();
  const { data, error } = await client.from("teams").select("id,slug,name,tag,logo_url,banner_url,region,captain_id,created_at").or(`id.eq.${slugOrId},slug.eq.${slugOrId}`).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const members = await client.from("team_members").select("user_id,profiles(id,username,display_name,avatar_url,riot_id,region,bio)").eq("team_id", data.id);
  if (members.error) throw members.error;
  return { ...data, members: (members.data ?? []).map((row) => row.profiles).filter(Boolean) as unknown as PublicPlayer[] };
}

export async function getPlayerLeaderboard(): Promise<RankingRow[]> {
  const client = await createClient();
  const { data, error } = await client.from("player_season_rankings").select("user_id,ranking_points,wins,matches_played,championships,previous_rank").order("ranking_points", { ascending: false }).limit(100);
  if (error) {
    console.error("[supabase] player leaderboard lookup failed", { code: error.code, message: error.message });
    if (error.code === "PGRST205" || /relation .* does not exist|column .* does not exist/i.test(error.message)) return [];
    throw new Error(`Unable to load player rankings: ${error.message}`);
  }
  const rankings = data ?? [];
  if (rankings.length === 0) return [];

  // player_season_rankings points to auth.users, so profiles cannot be embedded
  // through PostgREST without a direct foreign key to profiles.
  const userIds = rankings.map((row) => row.user_id);
  const { data: profiles, error: profilesError } = await client
    .from("profiles")
    .select("id,username,display_name")
    .in("id", userIds);
  if (profilesError) {
    console.error("[supabase] player leaderboard profile lookup failed", { code: profilesError.code, message: profilesError.message });
    throw new Error(`Unable to load player profiles: ${profilesError.message}`);
  }

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return rankings.map((row, index) => {
    const profile = profileById.get(row.user_id);
    const rank = index + 1;
    const previousRank = row.previous_rank ?? rank;
    return {
      rank,
      movement: previousRank - rank,
      id: row.user_id,
      name: profile?.display_name || profile?.username || "Player",
      subtitle: profile?.username || "",
      ranking_points: row.ranking_points,
      wins: row.wins,
      matches_played: row.matches_played,
      championships: row.championships,
    };
  });
}
