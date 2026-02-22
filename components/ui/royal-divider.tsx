export function RoyalDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3 text-xs tracking-[0.22em] text-[color:var(--royal-red)]/85">
      <span className="h-px flex-1 bg-[linear-gradient(to_right,transparent,#c9a55a,transparent)]" />
      <span className="font-semibold">{label}</span>
      <span className="h-px flex-1 bg-[linear-gradient(to_right,transparent,#c9a55a,transparent)]" />
    </div>
  );
}
