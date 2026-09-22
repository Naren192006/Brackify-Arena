"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STEPS = [
  {
    id: "profile",
    label: "Polish your profile",
    description: "Add a display name and avatar so organizers know who you are.",
    href: "#profile",
    cta: "Edit profile",
  },
  {
    id: "team",
    label: "Create your team",
    description: "You're the captain by default — invite up to five players.",
    href: "#my-teams",
    cta: "Create team",
  },
  {
    id: "tournament",
    label: "Join a tournament",
    description: "Register your roster for an open bracket and start climbing.",
    href: "/tournaments",
    cta: "Browse tournaments",
  },
] as const;

type Props = { hasTeams: boolean; hasRegistrations: boolean; userName: string };

export function OnboardingWizard({ hasTeams, hasRegistrations, userName }: Props) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem("brackify-onboarding-done") === "1");
  }, []);

  const done = { profile: false, team: hasTeams, tournament: hasRegistrations };
  const remaining = STEPS.filter((s) => !done[s.id]).length;

  function finish() {
    localStorage.setItem("brackify-onboarding-done", "1");
    setDismissed(true);
  }

  if (dismissed || remaining === 0) return null;

  return (
    <section
      aria-label="Getting started"
      className="relative overflow-hidden rounded-2xl border border-arena-accent/30 bg-gradient-to-br from-arena-accent/[0.08] via-transparent to-indigo-500/[0.06] p-4 sm:p-6"
    >
      <button
        onClick={finish}
        aria-label="Dismiss onboarding"
        className="absolute right-3 top-3 rounded-lg px-2 py-1 text-xs text-arena-muted transition-colors hover:text-arena-text focus-visible:outline-2"
      >
        Dismiss
      </button>
      <p className="text-xs uppercase tracking-[0.24em] text-arena-accent">Welcome to the arena, {userName}</p>
      <h2 className="mt-1 font-display text-xl font-bold text-arena-text sm:text-2xl">
        Three steps to your first match
      </h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, i) => {
          const isDone = done[step.id];
          return (
            <li
              key={step.id}
              className={`rounded-xl border p-4 transition-colors ${
                isDone ? "border-emerald-400/30 bg-emerald-400/[0.06]" : "border-arena-border bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    isDone ? "bg-emerald-400 text-black" : "bg-arena-bg-elevated text-arena-muted"
                  }`}
                >
                  {isDone ? "" : i + 1}
                </span>
                <p className="text-sm font-semibold text-arena-text">{step.label}</p>
              </div>
              <p className="mt-2 text-xs text-arena-muted">{step.description}</p>
              {!isDone && step.href.startsWith("#") ? (
                <a
                  href={step.href}
                  onClick={step.id === "tournament" ? finish : undefined}
                  className="mt-3 inline-block text-xs font-semibold text-arena-accent hover:underline"
                >
                  {step.cta} →
                </a>
              ) : !isDone ? (
                <Link
                  href={step.href}
                  onClick={finish}
                  className="mt-3 inline-block text-xs font-semibold text-arena-accent hover:underline"
                >
                  {step.cta} →
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
