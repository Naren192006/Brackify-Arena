import { supabase } from "@/lib/supabase/client";
import type { FairPlayReport, ReportCategory, ReportResolution, ReportStatus } from "@/types/reports";

export async function submitReport(input: { reportedUserId: string; tournamentId?: string | null; matchId?: string | null; teamId?: string | null; category: ReportCategory; description: string; evidenceUrl?: string }) {
  const { data, error } = await supabase.rpc("submit_fair_play_report", { target_reported_user_id: input.reportedUserId, target_tournament_id: input.tournamentId ?? null, target_match_id: input.matchId ?? null, target_team_id: input.teamId ?? null, target_category: input.category, target_description: input.description, target_evidence_url: input.evidenceUrl ?? null });
  if (error) throw error;
  return data as string;
}

export async function listReports(status?: ReportStatus): Promise<FairPlayReport[]> {
  let query = supabase.from("fair_play_reports").select("id,reporter_id,reported_user_id,tournament_id,match_id,team_id,category,description,evidence_url,status,moderator_notes,resolution,rejection_reason,created_at,resolved_at,moderator_id,tournaments(title,slug)").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  const reports = (data ?? []) as unknown as FairPlayReport[];
  const ids = [...new Set(reports.flatMap((report) => [report.reporter_id, report.reported_user_id]))];
  if (!ids.length) return reports;
  const profiles = await supabase.from("profiles").select("id,username,display_name").in("id", ids);
  if (profiles.error) throw profiles.error;
  const byId = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));
  return reports.map((report) => ({ ...report, reporter: byId.get(report.reporter_id) ?? null, reported: byId.get(report.reported_user_id) ?? null }));
}

export async function moderateReport(reportId: string, action: "investigating" | "resolved" | "rejected", resolution?: ReportResolution, notes?: string) {
  const { error } = await supabase.rpc("moderate_fair_play_report", { target_report_id: reportId, target_action: action, target_resolution: resolution ?? null, target_notes: notes ?? null });
  if (error) throw error;
}
