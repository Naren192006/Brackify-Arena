"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTournament } from "@/lib/tournaments/data";

export function TournamentCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [entryFee, setEntryFee] = useState(0);
  const [v, setV] = useState({
    title: "",
    slug: "",
    game: "VALORANT",
    mode: "5v5",
    max: "16",
    description: "",
    rules: "",
    open: "",
    close: "",
    start: "",
    banner: "",
  });

  const set = (key: keyof typeof v, value: string) =>
    setV((x) => ({ ...x, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const sanitizedFee = Math.max(0, Math.floor(Number(entryFee) || 0));
      await createTournament({
        title: v.title,
        slug: v.slug,
        maxTeams: Number(v.max),
        openAt: new Date(v.open).toISOString(),
        closeAt: new Date(v.close).toISOString(),
        startAt: new Date(v.start).toISOString(),
        entryFeeMinor: sanitizedFee * 100,
        entryFeeCurrency: "INR",
      });
      toast.success("Tournament created");
      router.push("/admin/tournaments");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message.replaceAll("_", " ") : "Could not create tournament"
      );
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof v, label: string, type = "text", required = true) => (
    <label className="field">
      <span>{label}</span>
      <input
        required={required}
        type={type}
        value={v[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {field("title", "Title")}
      {field("slug", "Slug")}
      {field("game", "Game")}
      {field("mode", "Team size")}
      {field("max", "Max teams", "number")}

      {/* Entry Fee (₹) */}
      <label className="field">
        <span>Entry Fee (₹)</span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0 for free tournament"
          value={entryFee === 0 ? "" : entryFee}
          onChange={(e) => {
            const val = e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value) || 0));
            setEntryFee(val);
          }}
        />
        <span className="text-xs text-arena-muted">Enter 0 for a free tournament.</span>
      </label>

      {field("banner", "Banner URL", "text", false)}
      {field("open", "Registration opens", "datetime-local")}
      {field("close", "Registration closes", "datetime-local")}
      {field("start", "Start time", "datetime-local")}

      <label className="field sm:col-span-2">
        <span>Description</span>
        <textarea rows={4} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </label>

      <label className="field sm:col-span-2">
        <span>Rules</span>
        <textarea rows={5} value={v.rules} onChange={(e) => set("rules", e.target.value)} />
      </label>

      <button className="btn-primary sm:col-span-2" disabled={busy}>
        {busy ? "Creating…" : "Create tournament"}
      </button>
    </form>
  );
}
