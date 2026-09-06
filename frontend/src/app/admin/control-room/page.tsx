import { AdminControlRoom } from "@/components/admin/control-room/AdminControlRoom";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tournament Control Room — Brackify Arena Admin",
  description: "Manage real-time tournament operations, bracket progression, and match actions.",
};

export default function AdminControlRoomPage() {
  return <AdminControlRoom />;
}
