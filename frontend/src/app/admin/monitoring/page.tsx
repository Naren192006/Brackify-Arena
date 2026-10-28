import { MonitoringDashboard } from "@/components/admin/monitoring/MonitoringDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Monitoring | Brackify Arena Admin",
  description:
    "CloudOps Sentinel Phase 1 monitoring: backend health, dependency readiness, and cumulative HTTP request metrics.",
};

export default function AdminMonitoringPage() {
  return <MonitoringDashboard />;
}
