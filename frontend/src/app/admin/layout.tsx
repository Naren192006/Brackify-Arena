import { AdminShell } from "@/components/admin/AdminShell";
import { AdminAuthProvider } from "@/context/AdminAuthContext";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminShell>{children}</AdminShell>
    </AdminAuthProvider>
  );
}


