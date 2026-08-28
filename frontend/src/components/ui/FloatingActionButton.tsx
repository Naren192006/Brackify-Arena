"use client";
import { useState } from "react";
export function FloatingActionButton() { const [open, setOpen] = useState(false); return <div className="floating-actions"><div className={open ? "floating-action-menu floating-action-menu-open" : "floating-action-menu"}><a href="#create-team">Create Team</a><a href="#my-teams">Join Team</a><a href="#my-teams">Find Team</a></div><button aria-label="Open team actions" className="floating-action-button" onClick={() => setOpen((value) => !value)}>{open ? "×" : "+"}</button></div>; }
