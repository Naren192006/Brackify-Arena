"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAdminTournamentApi } from "@/lib/admin/tournaments";

const COMMON_GAMES = [
  "VALORANT",
  "BGMI / PUBG Mobile",
  "Counter-Strike 2",
  "Free Fire MAX",
  "Rocket League",
  "Apex Legends",
  "Dota 2",
  "League of Legends",
  "Call of Duty: Warzone",
  "Overwatch 2",
  "Chess",
];

const PLATFORMS = ["PC", "Mobile", "PlayStation", "Xbox", "Cross-Platform", "Nintendo Switch"];

const POWER_OF_TWO_CAPACITIES = [4, 8, 16, 32, 64, 128, 256];

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function TournamentCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [game, setGame] = useState("VALORANT");
  const [platform, setPlatform] = useState("PC");
  const [teamSize, setTeamSize] = useState(5);
  const [maxTeams, setMaxTeams] = useState(16);
  const [entryFee, setEntryFee] = useState(0);
  const [format, setFormat] = useState("single_elimination");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState(
    "1. All teams must check-in 15 minutes before match start.\n2. Fair play and anti-cheat policies apply strictly.\n3. Toxic behavior or match-fixing will result in immediate disqualification."
  );
  const [bannerUrl, setBannerUrl] = useState("");
  const [initialStatus, setInitialStatus] = useState<"draft" | "published">("draft");

  // Date State (default to upcoming dates)
  const [openDate, setOpenDate] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [startDate, setStartDate] = useState("");

  // Initialize sensible default dates
  useEffect(() => {
    const now = new Date();
    const open = new Date(now.getTime() + 1000 * 60 * 60); // 1 hr from now
    const close = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3); // 3 days from now
    const start = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 4); // 4 days from now

    const toInputFormat = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
        d.getMinutes()
      )}`;
    };

    setOpenDate(toInputFormat(open));
    setCloseDate(toInputFormat(close));
    setStartDate(toInputFormat(start));
  }, []);

  // Auto-slug update
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slugManuallyEdited) {
      setSlug(slugify(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (!title.trim() || title.trim().length < 3) {
      toast.error("Tournament title must be at least 3 characters.");
      return;
    }

    const openDt = new Date(openDate);
    const closeDt = new Date(closeDate);
    const startDt = new Date(startDate);

    if (openDt >= closeDt) {
      toast.error("Registration open date must be earlier than registration close date.");
      return;
    }

    if (closeDt > startDt) {
      toast.error("Registration close date must be on or before tournament start time.");
      return;
    }

    if (entryFee < 0) {
      toast.error("Entry fee cannot be negative.");
      return;
    }

    if (maxTeams < 2 || maxTeams > 512) {
      toast.error("Max teams must be between 2 and 512.");
      return;
    }

    setBusy(true);
    try {
      const created = await createAdminTournamentApi({
        title: title.trim(),
        slug: slug.trim() || slugify(title.trim()),
        game,
        platform,
        team_size: teamSize,
        max_teams: maxTeams,
        entry_fee: entryFee,
        entry_fee_currency: "INR",
        registration_open_at: openDt.toISOString(),
        registration_close_at: closeDt.toISOString(),
        start_time: startDt.toISOString(),
        timezone,
        format,
        description: description.trim() || null,
        rules: rules.trim() || null,
        banner_url: bannerUrl.trim() || null,
        status: initialStatus,
      });

      // Invalidate queries across admin and public caches
      queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tournaments-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["public-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["managed-tournaments"] });

      toast.success(`Tournament "${created.title}" created successfully!`);
      router.push("/admin/tournaments");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create tournament.");
    } finally {
      setBusy(false);
    }
  };

  const isCapPowerOfTwo = isPowerOfTwo(maxTeams);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 1. Basic Information */}
      <div className="space-y-4 rounded-2xl border border-white/10 bg-arena-surface/80 p-6 backdrop-blur-md">
        <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
          <span>1. Basic Information</span>
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Tournament Name *
            </label>
            <input
              type="text"
              required
              className="input-field w-full"
              placeholder="e.g. Brackify Championship Season 1"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              URL Slug *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-arena-muted font-mono">/</span>
              <input
                type="text"
                required
                className="input-field w-full pl-6 font-mono text-xs"
                placeholder="brackify-championship-season-1"
                value={slug}
                onChange={(e) => {
                  setSlug(slugify(e.target.value));
                  setSlugManuallyEdited(true);
                }}
              />
            </div>
          </div>

          {/* Game */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Game Title *
            </label>
            <input
              type="text"
              required
              list="games-list"
              className="input-field w-full"
              placeholder="VALORANT"
              value={game}
              onChange={(e) => setGame(e.target.value)}
            />
            <datalist id="games-list">
              {COMMON_GAMES.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          {/* Platform */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Platform *
            </label>
            <select
              className="input-field w-full bg-arena-bg text-white"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Banner URL */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Banner Image URL
            </label>
            <input
              type="url"
              className="input-field w-full font-mono text-xs"
              placeholder="https://images.unsplash.com/..."
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Description & Overview
            </label>
            <textarea
              rows={3}
              className="input-field w-full text-xs"
              placeholder="Join India's premier community esports showdown..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 2. Registration & Capacity Settings */}
      <div className="space-y-4 rounded-2xl border border-white/10 bg-arena-surface/80 p-6 backdrop-blur-md">
        <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
          <span>2. Registration & Capacity</span>
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Max Teams */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Max Teams Capacity *
            </label>
            <input
              type="number"
              min={2}
              max={512}
              required
              className="input-field w-full font-mono"
              value={maxTeams}
              onChange={(e) => setMaxTeams(Number(e.target.value))}
            />
            {/* Quick power-of-two pills */}
            <div className="mt-2 flex flex-wrap gap-1">
              {POWER_OF_TWO_CAPACITIES.map((cap) => (
                <button
                  type="button"
                  key={cap}
                  onClick={() => setMaxTeams(cap)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    maxTeams === cap
                      ? "bg-arena-accent text-arena-bg font-extrabold"
                      : "bg-white/5 text-arena-muted hover:text-white"
                  }`}
                >
                  {cap}
                </button>
              ))}
            </div>
            {!isCapPowerOfTwo && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                ⚠️ Bracket generation works best with power-of-two capacities (4, 8, 16, 32, 64, 128). Non-power-of-two tournaments will include first-round byes.
              </p>
            )}
          </div>

          {/* Team Size */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Team Size (Players) *
            </label>
            <select
              className="input-field w-full bg-arena-bg text-white"
              value={teamSize}
              onChange={(e) => setTeamSize(Number(e.target.value))}
            >
              <option value={1}>1v1 (Solo)</option>
              <option value={2}>2v2 (Duo)</option>
              <option value={3}>3v3 (Trio)</option>
              <option value={4}>4v4 (Squad)</option>
              <option value={5}>5v5 (Standard)</option>
              <option value={6}>6v6</option>
            </select>
          </div>

          {/* Entry Fee (INR) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Entry Fee (₹ INR) *
            </label>
            <input
              type="number"
              min={0}
              step={1}
              required
              className="input-field w-full font-mono"
              placeholder="0 for free entry"
              value={entryFee === 0 ? "" : entryFee}
              onChange={(e) => setEntryFee(Math.max(0, Number(e.target.value) || 0))}
            />
            <span className="mt-1 block text-[11px] text-arena-muted">
              {entryFee === 0 ? "Free Entry Tournament" : `₹${entryFee.toFixed(2)} per registered team`}
            </span>
          </div>

          {/* Registration Open */}
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Registration Opens *
            </label>
            <input
              type="datetime-local"
              required
              className="input-field w-full text-xs"
              value={openDate}
              onChange={(e) => setOpenDate(e.target.value)}
            />
          </div>

          {/* Registration Close */}
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Registration Closes *
            </label>
            <input
              type="datetime-local"
              required
              className="input-field w-full text-xs"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </div>

          {/* Timezone */}
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Event Timezone *
            </label>
            <select
              className="input-field w-full bg-arena-bg text-white text-xs"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
              <option value="UTC">UTC (Coordinated Universal Time)</option>
              <option value="America/New_York">America/New_York (EST/EDT)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST - UTC+04:00)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+08:00)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Schedule & Format */}
      <div className="space-y-4 rounded-2xl border border-white/10 bg-arena-surface/80 p-6 backdrop-blur-md">
        <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
          <span>3. Schedule & Format</span>
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Start Time */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Tournament Start Time *
            </label>
            <input
              type="datetime-local"
              required
              className="input-field w-full text-xs"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* Format */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Tournament Bracket Format *
            </label>
            <select
              className="input-field w-full bg-arena-bg text-white"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="single_elimination">Single Elimination</option>
              <option value="double_elimination">Double Elimination</option>
              <option value="round_robin">Round Robin</option>
            </select>
          </div>

          {/* Rules */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
              Official Tournament Rules
            </label>
            <textarea
              rows={4}
              className="input-field w-full font-mono text-xs"
              value={rules}
              onChange={(e) => setRules(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 4. Publication & Submit */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-arena-surface/90 p-4 sm:p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-arena-muted">
            Initial Status:
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInitialStatus("draft")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                initialStatus === "draft"
                  ? "bg-white/15 text-white border border-white/20 font-semibold"
                  : "text-arena-muted hover:text-white"
              }`}
            >
              Draft (Hidden)
            </button>
            <button
              type="button"
              onClick={() => setInitialStatus("published")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                initialStatus === "published"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold"
                  : "text-arena-muted hover:text-white"
              }`}
            >
              Published
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full sm:w-auto px-8 py-3 text-sm font-semibold shadow-xl shadow-cyan-500/20"
        >
          {busy ? "Creating Tournament Arena…" : "Create Tournament Arena"}
        </button>
      </div>
    </form>
  );
}
