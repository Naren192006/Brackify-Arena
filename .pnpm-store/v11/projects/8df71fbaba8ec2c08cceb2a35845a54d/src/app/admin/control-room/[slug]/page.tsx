import { redirect } from "next/navigation";
import { ControlRoomShell } from "@/components/admin/control-room/ControlRoomShell";
import { createClient } from "@/lib/supabase/server";
import { isTournamentAdmin } from "@/lib/admin/permissions";
import { getAdminTournament } from "@/lib/admin/tournaments";
export default async function ControlRoomPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const client = await createClient(); const { data } = await client.auth.getUser(); if (!data.user) redirect("/admin/login"); const tournament = await getAdminTournament(slug); if (!tournament || !(await isTournamentAdmin(client, data.user.id, tournament.id))) redirect(`/tournaments/${slug}`); return <ControlRoomShell slug={slug} />; }
