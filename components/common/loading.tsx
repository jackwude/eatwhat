"use client";

import { useEffect, useMemo, useState } from "react";

export function Loading({ label, showProgress = true }: { label: string; showProgress?: boolean }) {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    if (!showProgress) return;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return prev;
        const delta = prev < 40 ? 8 : prev < 70 ? 4 : 2;
        return Math.min(92, prev + delta);
      });
    }, 600);

    return () => clearInterval(timer);
  }, [showProgress]);

  const progressText = useMemo(() => `${progress}%`, [progress]);

  return (
    <div className="glass-card rounded-2xl p-5 text-sm text-[color:var(--muted)]">
      <p className="mb-3 font-medium text-[color:var(--royal-red)]">{label}</p>
      {showProgress ? (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#f3dfb6]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#e0b34a,#c89434)] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[color:var(--muted)]">御膳进度：{progressText}</p>
        </>
      ) : (
        <div className="h-2 w-36 animate-pulse rounded-full bg-[#e7c97e]" />
      )}
    </div>
  );
}
