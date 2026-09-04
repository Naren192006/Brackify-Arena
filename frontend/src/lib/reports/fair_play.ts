import { supabase } from "@/lib/supabase/client";

export type FairPlayReport = {
  id: string;
  tournament_id: string;
  match_id: string | null;
  reporter_registration_id: string | null;
  accused_registration_id: string | null;
  reason: string;
  description: string;
  status: "pending" | "investigating" | "resolved" | "rejected" | "banned";
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  tournament?: {
    id: string;
    title: string;
    slug: string;
  } | null;
  match?: {
    id: string;
    round_number: number;
    match_number: number;
  } | null;
  reporter_team?: {
    id: string;
    name: string;
    tag: string | null;
    logo_url: string | null;
  } | null;
  accused_team?: {
    id: string;
    name: string;
    tag: string | null;
    logo_url: string | null;
  } | null;
};

export async function createReportApi(payload: {
  tournament_id: string;
  match_id?: string | null;
  reporter_registration_id?: string | null;
  accused_registration_id?: string | null;
  reason: string;
  description: string;
}) {
  const { data, error } = await supabase
    .from("reports")
    .insert({
      tournament_id: payload.tournament_id,
      match_id: payload.match_id || null,
      reporter_registration_id: payload.reporter_registration_id || null,
      accused_registration_id: payload.accused_registration_id || null,
      reason: payload.reason,
      description: payload.description,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message || "Failed to submit fair play report");
  }
  return data;
}

export async function listAdminReportsApi(
  filterStatus?: string,
  page: number = 1,
  pageSize: number = 20
): Promise<FairPlayReport[]> {
  let query = supabase
    .from("reports")
    .select("id,tournament_id,match_id,reporter_registration_id,accused_registration_id,reason,description,status,admin_notes,resolved_by,created_at,updated_at,resolved_at")
    .order("created_at", { ascending: false });

  if (filterStatus && filterStatus !== "all") {
    query = query.eq("status", filterStatus);
  }

  // Apply pagination range
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data: reports, error } = await query;
  if (error) throw error;
  if (!reports || reports.length === 0) return [];

  // Fetch joined tournament, match, and registration metadata
  const tournamentIds = Array.from(new Set(reports.map((r) => r.tournament_id).filter(Boolean)));
  const matchIds = Array.from(new Set(reports.map((r) => r.match_id).filter(Boolean)));
  const regIds = Array.from(
    new Set([
      ...reports.map((r) => r.reporter_registration_id),
      ...reports.map((r) => r.accused_registration_id),
    ].filter(Boolean))
  );

  const [tRes, mRes, regRes] = await Promise.all([
    tournamentIds.length
      ? supabase.from("tournaments").select("id,title,slug").in("id", tournamentIds)
      : { data: [] },
    matchIds.length
      ? supabase.from("matches").select("id,round_number,match_number").in("id", matchIds)
      : { data: [] },
    regIds.length
      ? supabase
          .from("tournament_registrations")
          .select("id,team_id,teams(id,name,tag,logo_url)")
          .in("id", regIds)
      : { data: [] },
  ]);

  const tMap = new Map((tRes.data ?? []).map((t) => [t.id, t]));
  const mMap = new Map((mRes.data ?? []).map((m) => [m.id, m]));
  const regMap = new Map((regRes.data ?? []).map((r) => [r.id, r]));

  return reports.map((r) => {
    const repReg = r.reporter_registration_id ? regMap.get(r.reporter_registration_id) : null;
    const accReg = r.accused_registration_id ? regMap.get(r.accused_registration_id) : null;

    return {
      ...r,
      tournament: tMap.get(r.tournament_id) || null,
      match: r.match_id ? mMap.get(r.match_id) || null : null,
      reporter_team: (repReg as any)?.teams || null,
      accused_team: (accReg as any)?.teams || null,
    };
  });
}

export async function updateReportStatusApi(
  reportId: string,
  status: "pending" | "investigating" | "resolved" | "rejected" | "banned",
  adminNotes?: string | null
) {
  const patchData: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (adminNotes !== undefined) {
    patchData.admin_notes = adminNotes;
  }

  if (status === "resolved" || status === "rejected" || status === "banned") {
    patchData.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("reports")
    .update(patchData)
    .eq("id", reportId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function countAdminReportsApi(filterStatus?: string): Promise<number> {
  let query = supabase
    .from("reports")
    .select("id", { count: "exact", head: true });

  if (filterStatus && filterStatus !== "all") {
    query = query.eq("status", filterStatus);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

