export function Loading({ label }: { label: string }) {
  return (
    <div className="glass-card rounded-2xl p-5 text-sm text-[color:var(--muted)]">
      <div className="mb-2 h-2 w-36 animate-pulse rounded-full bg-amber-200" />
      {label}
    </div>
  );
}
