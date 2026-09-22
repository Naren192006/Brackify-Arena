"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { authApi } from "@/lib/api/client";
import { toast } from "sonner";
import { MailIcon, BellIcon, TrashIcon, CreditCardIcon, CheckIcon } from "@/components/ui/icons";
import { IosSwitch } from "@/components/ui/kit";

type PaymentRow = {
  id: string;
  amount_paise: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  razorpay_payment_id: string | null;
  tournaments: { title: string } | null;
};

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const statusStyles: Record<string, string> = {
  paid: "text-emerald-400",
  created: "text-amber-400",
  failed: "text-arena-danger",
  refunded: "text-sky-400",
};

export function AccountSettings({ email }: { email: string }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDanger, setShowDanger] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const meQuery = useQuery({
    queryKey: ["me", "account-settings"],
    queryFn: () => authApi.me(),
    staleTime: 30_000,
  });

  const paymentsQuery = useQuery({
    queryKey: ["payment-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount_paise, currency, status, created_at, paid_at, razorpay_payment_id, tournaments(title)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as PaymentRow[];
    },
    staleTime: 60_000,
  });

  const user = meQuery.data?.user;
  const emailVerified = user?.email_verified ?? false;
  const notificationsEnabled = user?.email_notifications_enabled ?? true;
  const prefsPending = meQuery.isFetching;

  async function toggleNotifications() {
    try {
      await authApi.setNotificationPreferences(!notificationsEnabled);
      toast.success(
        !notificationsEnabled ? "Notification emails on" : "Notification emails off",
      );
      void meQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update preferences");
    }
  }

  async function sendVerification() {
    setVerifying(true);
    try {
      const res = await authApi.requestEmailVerification();
      toast.success(res.message || "Verification link sent — check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send verification email");
    } finally {
      setVerifying(false);
    }
  }

  async function onDelete() {
    if (confirmText !== "DELETE") {
      toast.error("Type DELETE to confirm.");
      return;
    }
    setDeleting(true);
    try {
      await authApi.deleteAccount(password, "DELETE");
      toast.success("Account deleted. Goodbye, gladiator.");
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deletion failed — check your password.");
      setDeleting(false);
    }
  }

  const payments = paymentsQuery.data ?? [];

  return (
    <section id="account" className="glass-panel mt-6 rounded-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between sm:mb-5">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold uppercase tracking-wide text-arena-text sm:text-2xl">
          <SettingsGlyph />
          Account Settings
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Email + verification + notifications */}
        <div className="space-y-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-arena-text-muted">
              <MailIcon size={13} /> Email
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-arena-text">
              {email}
              {emailVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                  <CheckIcon size={11} /> Verified
                </span>
              ) : (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                  Unverified
                </span>
              )}
            </p>
            {!emailVerified && (
              <button
                type="button"
                onClick={sendVerification}
                disabled={verifying}
                className="mt-2 text-xs text-arena-accent hover:underline disabled:opacity-50"
              >
                {verifying ? "Sending…" : "Send verification link"}
              </button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/[0.04] p-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-arena-text">
                <BellIcon size={14} /> Notification emails
              </p>
              <p className="mt-0.5 text-xs text-arena-text-muted">
                Match reminders, results and tournament updates
              </p>
            </div>
            <IosSwitch
              checked={notificationsEnabled}
              onToggle={toggleNotifications}
              label="Toggle notification emails"
              disabled={prefsPending}
            />
          </div>

          <p className="text-xs text-arena-muted">
            Security emails (password reset, verification) are always sent regardless of this
            setting. See our{" "}
            <a href="/privacy" className="text-arena-accent hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>

        {/* Payment history */}
        <div>
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-arena-text-muted">
            <CreditCardIcon size={13} /> Payment History
          </p>
          {paymentsQuery.isPending ? (
            <p className="mt-2 text-sm text-arena-muted">Loading…</p>
          ) : payments.length === 0 ? (
            <p className="mt-2 text-sm text-arena-muted">
              No payments yet. Entry-fee payments appear here with receipts.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="press-card flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.07]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-arena-text">
                      {p.tournaments?.title ?? "Tournament entry"}
                    </p>
                    <p className="text-xs text-arena-muted">
                      {fmtDate(p.paid_at ?? p.created_at)}
                      {p.razorpay_payment_id ? ` · ${p.razorpay_payment_id}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-arena-text">
                      {fmt(p.amount_paise, p.currency)}
                    </p>
                    <p className={`text-xs ${statusStyles[p.status] ?? "text-arena-muted"}`}>
                      {p.status}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="mt-6 border-t border-arena-border pt-5">
        {!showDanger ? (
          <button
            type="button"
            onClick={() => setShowDanger(true)}
            className="inline-flex items-center gap-1.5 text-sm text-arena-danger/80 underline-offset-2 hover:text-arena-danger hover:underline"
          >
            <TrashIcon size={14} /> Delete account
          </button>
        ) : (
          <div className="rounded-xl border border-arena-danger/30 bg-arena-danger/5 p-4">
            <p className="text-sm font-semibold text-arena-danger">Delete your account</p>
            <p className="mt-1 text-xs text-arena-muted">
              This permanently removes your profile, teams and personal data. Competitive records
              are anonymized, not erased. This cannot be undone.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-arena-muted">
                Confirm password
                <input
                  type="password"
                  autoComplete="current-password"
                  className="input-field mt-1 w-full"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="text-xs text-arena-muted">
                Type DELETE to confirm
                <input
                  type="text"
                  className="input-field mt-1 w-full"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting || confirmText !== "DELETE" || !password}
                className="rounded-lg bg-arena-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDanger(false);
                  setConfirmText("");
                  setPassword("");
                }}
                className="rounded-lg border border-arena-border px-4 py-2 text-sm text-arena-muted hover:text-arena-text"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SettingsGlyph() {
  return (
    <span className="glass-panel flex h-9 w-9 items-center justify-center rounded-lg text-arena-accent">
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </span>
  );
}
