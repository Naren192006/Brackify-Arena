"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listTournaments } from "@/lib/tournaments/data";
import {
  AdminUserRecord,
  createAdminUserApi,
  deleteAdminUserApi,
  listAdminUsersApi,
  updateAdminUserApi,
} from "@/lib/admin/auth";
import { useAdminAuth } from "@/context/AdminAuthContext";

const card = "rounded-2xl border border-arena-border bg-arena-surface/80 p-6";

export function SuperAdminDashboard() {
  const queryClient = useQueryClient();
  const { admin } = useAdminAuth();

  // Create Sub Admin Form State
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"sub_admin" | "super_admin">("sub_admin");
  const [permDelete, setPermDelete] = useState(true);
  const [permBrackets, setPermBrackets] = useState(true);
  const [permMatches, setPermMatches] = useState(true);

  // Queries
  const tournaments = useQuery({
    queryKey: ["super-admin-tournaments"],
    queryFn: () => listTournaments(""),
  });

  const adminsQuery = useQuery({
    queryKey: ["admin-users-list"],
    queryFn: listAdminUsersApi,
  });

  // Mutations
  const createAdminMutation = useMutation({
    mutationFn: async () => {
      const perms: string[] = [];
      if (permDelete) perms.push("delete_tournaments");
      if (permBrackets) perms.push("manage_brackets");
      if (permMatches) perms.push("manage_matches");
      if (newRole === "super_admin") perms.push("all", "manage_users");

      return createAdminUserApi({
        email: newEmail,
        password: newPassword,
        role: newRole,
        permissions: perms,
      });
    },
    onSuccess: () => {
      toast.success("Administrator account created successfully");
      setNewEmail("");
      setNewPassword("");
      void queryClient.invalidateQueries({ queryKey: ["admin-users-list"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create administrator");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      return updateAdminUserApi(userId, { active });
    },
    onSuccess: () => {
      toast.success("Admin status updated");
      void queryClient.invalidateQueries({ queryKey: ["admin-users-list"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update admin status");
    },
  });

  const deleteAdminMutation = useMutation({
    mutationFn: async (userId: string) => {
      return deleteAdminUserApi(userId);
    },
    onSuccess: () => {
      toast.success("Administrator account removed");
      void queryClient.invalidateQueries({ queryKey: ["admin-users-list"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete administrator");
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    createAdminMutation.mutate();
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-arena-accent font-semibold">
          Platform Operations &amp; Access Control
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-arena-text">
          Admin Management Dashboard
        </h1>
        <p className="mt-1 text-sm text-arena-muted">
          Manage platform administrators, assign granular roles, and configure system permissions.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Create Sub-Admin / Admin Account */}
        <section className={card}>
          <h2 className="font-display text-xl font-semibold text-arena-text">
            Create Platform Administrator
          </h2>
          <p className="mt-1 text-xs text-arena-muted">
            Issue dedicated login credentials for platform operators.
          </p>

          <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-arena-muted mb-1">
                Admin Email
              </label>
              <input
                className="input-field w-full"
                type="email"
                placeholder="operator@brackify.com"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-arena-muted mb-1">
                Temporary Password (min 8 chars)
              </label>
              <input
                className="input-field w-full"
                type="password"
                placeholder="••••••••••••"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-arena-muted mb-1">
                  Role
                </label>
                <select
                  className="input-field w-full"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                >
                  <option value="sub_admin">Sub Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-arena-muted mb-1">
                  Permissions
                </label>
                <div className="space-y-1.5 pt-1 text-xs text-white/80">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={permDelete}
                      onChange={(e) => setPermDelete(e.target.checked)}
                      className="rounded border-white/20 bg-arena-surface"
                    />
                    <span>Delete Tournaments</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={permBrackets}
                      onChange={(e) => setPermBrackets(e.target.checked)}
                      className="rounded border-white/20 bg-arena-surface"
                    />
                    <span>Manage Brackets</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={permMatches}
                      onChange={(e) => setPermMatches(e.target.checked)}
                      className="rounded border-white/20 bg-arena-surface"
                    />
                    <span>Manage Matches</span>
                  </label>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={createAdminMutation.isPending}
              className="btn-primary w-full py-2.5 text-sm font-semibold"
            >
              {createAdminMutation.isPending ? "Creating Account…" : "Create Administrator"}
            </button>
          </form>
        </section>

        {/* Existing Platform Administrators */}
        <section className={card}>
          <h2 className="font-display text-xl font-semibold text-arena-text">
            Active Platform Administrators
          </h2>
          <p className="mt-1 text-xs text-arena-muted">
            Overview of all seeded and configured platform administrator accounts.
          </p>

          <div className="mt-5 space-y-3">
            {adminsQuery.isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-arena-accent border-t-transparent" />
              </div>
            ) : adminsQuery.data?.length ? (
              adminsQuery.data.map((user: AdminUserRecord) => {
                const isSelf = user.id === admin?.id;
                return (
                  <div
                    key={user.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-arena-border bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-arena-text text-sm">{user.email}</span>
                        {isSelf && (
                          <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] text-cyan-300">
                            You
                          </span>
                        )}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            user.role === "super_admin"
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                          }`}
                        >
                          {user.role === "super_admin" ? "Super Admin" : "Sub Admin"}
                        </span>
                        {!user.active && (
                          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-arena-muted">
                        <span>Permissions:</span>
                        {user.permissions?.length ? (
                          user.permissions.map((p) => (
                            <span key={p} className="text-white/60">
                              {p}
                            </span>
                          ))
                        ) : (
                          <span className="text-arena-muted italic">None</span>
                        )}
                      </div>
                    </div>

                    {!isSelf && (
                      <div className="flex items-center gap-2 pt-2 sm:pt-0">
                        <button
                          onClick={() =>
                            toggleActiveMutation.mutate({
                              userId: user.id,
                              active: !user.active,
                            })
                          }
                          disabled={toggleActiveMutation.isPending}
                          className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                            user.active
                              ? "border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10"
                              : "border-emerald-500/30 text-arena-success hover:bg-emerald-500/10"
                          }`}
                        >
                          {user.active ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to permanently delete admin ${user.email}?`)) {
                              deleteAdminMutation.mutate(user.id);
                            }
                          }}
                          disabled={deleteAdminMutation.isPending}
                          className="rounded-lg border border-arena-danger/30 px-2.5 py-1 text-xs text-arena-danger hover:bg-arena-danger/10 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-arena-muted">No administrators registered.</p>
            )}
          </div>
        </section>
      </div>

      {/* Tournaments overview */}
      <section className={card}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold text-arena-text">
            System Tournaments
          </h2>
          <Link
            href="/admin/tournaments"
            className="text-xs font-semibold text-arena-accent hover:underline"
          >
            View All Tournaments &rarr;
          </Link>
        </div>
        <div className="space-y-2">
          {tournaments.data?.length ? (
            tournaments.data.slice(0, 5).map((t) => (
              <Link
                key={t.id}
                href={`/admin/tournaments/${t.slug}`}
                className="flex items-center justify-between rounded-xl bg-white/[0.04] p-3 text-sm hover:bg-white/[0.07] transition-colors"
              >
                <span className="font-medium text-arena-text">{t.title}</span>
                <span className="text-xs uppercase text-arena-accent font-semibold">
                  {t.status}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-arena-muted">No tournaments yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
