"use client";

import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function FooterRevolver() {
  const reducedMotion = useReducedMotion();
  const pathname = usePathname();
  const [bulletCount, setBulletCount] = useState(6);
  const [rotation, setRotation] = useState(0);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const hintWasSeen = window.localStorage.getItem("brackify-barrel-hint-seen");
    if (!hintWasSeen) {
      setShowHint(true);
      window.localStorage.setItem("brackify-barrel-hint-seen", "1");
    }

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) < 50 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      if (event.target instanceof Element && event.target.closest("nav, aside, input, textarea, button, a")) return;
      const direction = event.deltaX > 0 ? -1 : 1;
      setBulletCount((count) => Math.min(6, Math.max(0, count + direction)));
      setRotation((angle) => angle + direction * 60);
      setShowHint(false);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, button, a")) return;
      if (event.key === "ArrowRight") interact("right");
      if (event.key === "ArrowLeft") interact("left");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("wheel", onWheel); window.removeEventListener("keydown", onKeyDown); };
  }, []);

  const interact = (direction: "left" | "right") => {
    const delta = direction === "right" ? -1 : 1;
    setBulletCount((count) => Math.min(6, Math.max(0, count + delta)));
    setRotation((angle) => angle + delta * 60);
    setShowHint(false);
  };

  const reset = () => {
    setBulletCount(6);
    setRotation(0);
  };

  return (
    <div className="barrel-container" aria-label="Interactive barrel, rotate with horizontal scroll or arrow keys">
      <div className="footer-revolver-progress" aria-live="polite">{bulletCount}/6</div>
      {showHint ? <p className="footer-revolver-hint">Shift-scroll or use ← → to interact</p> : null}
      <motion.div
        key={pathname}
        className="footer-revolver"
        initial={{ opacity: 0, scale: 0.9, rotate: rotation }}
        animate={{ opacity: 1, scale: bulletCount === 0 ? 1.03 : 1, rotate: rotation }}
        transition={{ duration: reducedMotion ? 0 : 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        role="img"
      >
        <svg className="revolver-barrel" viewBox="0 0 240 240" role="presentation">
          <circle cx="120" cy="120" r="96" className="revolver-body" />
          <circle cx="120" cy="120" r="23" className="revolver-center" />
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const angle = (index * Math.PI) / 3 - Math.PI / 2;
            const x = 120 + Math.cos(angle) * 58;
            const y = 120 + Math.sin(angle) * 58;
            return <g key={index}><circle cx={x} cy={y} r="27" className="revolver-chamber-ring" /><motion.circle cx={x} cy={y} r="14" className="revolver-bullet" animate={{ opacity: index < bulletCount ? 1 : 0, scale: index < bulletCount ? 1 : 0 }} transition={{ duration: reducedMotion ? 0 : 0.4, ease: "easeOut" }} /></g>;
          })}
        </svg>
      </motion.div>
      {bulletCount === 0 ? <button type="button" className="footer-revolver-reset" onClick={reset}>Reload</button> : null}
    </div>
  );
}
