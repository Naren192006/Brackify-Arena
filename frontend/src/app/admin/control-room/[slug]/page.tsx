import { ControlRoomShell } from "@/components/admin/control-room/ControlRoomShell";

export const dynamic = "force-dynamic";

export default async function ControlRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ControlRoomShell slug={slug} />;
}
