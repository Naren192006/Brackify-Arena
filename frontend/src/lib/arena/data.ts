import { supabase } from "@/lib/supabase/client";
import type { ActivityEvent, Notification, Profile, Team, TeamInvitation } from "@/types/arena";

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("id,display_name,username,avatar_url,riot_id,region,bio").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function getTeams(userId: string): Promise<Team[]> {
  const { data, error } = await supabase.from("team_members").select("role, teams(id,name,tag,description,logo_url,captain_id)").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const team = row.teams as unknown as Omit<Team, "role"> | null;
    return team ? [{ ...team, role: row.role as Team["role"] }] : [];
  });
}

export async function getInvitations(userId: string): Promise<TeamInvitation[]> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const email = authData.user?.email?.toLowerCase();
  const recipientFilter = email ? `invitee_id.eq.${userId},invitee_email.eq.${email}` : `invitee_id.eq.${userId}`;
  const { data, error } = await supabase.from("team_invitations").select("id,status,invitee_email,created_at,teams(name)").or(recipientFilter).eq("status", "pending").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TeamInvitation[];
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase.from("notifications").select("id,title,body,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(3);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function getRecentActivity(userId: string): Promise<ActivityEvent[]> {
  const { data, error } = await supabase.from("activity_events").select("id,description,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5);
  if (error) throw error;
  return (data ?? []) as ActivityEvent[];
}
