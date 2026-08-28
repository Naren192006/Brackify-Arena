export type Profile = {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
  riot_id: string | null;
  region: string | null;
  bio: string | null;
};

export type Team = {
  id: string;
  name: string;
  logo_url: string | null;
  captain_id: string;
  tag: string | null;
  description: string | null;
  role: "captain" | "member";
  member_count?: number;
};

export type TeamInvitation = {
  id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  invitee_email: string | null;
  created_at: string;
  teams: { name: string } | null;
};

export type Notification = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
};

export type ActivityEvent = {
  id: string;
  description: string;
  created_at: string;
};
