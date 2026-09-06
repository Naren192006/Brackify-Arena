import { OrganizerAnalyticsDashboard } from "@/components/admin/analytics/OrganizerAnalyticsDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Organizer Analytics — Brackify Arena Admin",
  description: "Real-time tournament revenue, registration conversion trends, and match telemetry.",
};

export default function AdminAnalyticsPage() {
  return <OrganizerAnalyticsDashboard />;
}
