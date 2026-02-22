import { clsx } from "clsx";

type RoyalBadgeVariant = "easy" | "medium" | "hard";

const variantMap: Record<RoyalBadgeVariant, string> = {
  easy: "bg-emerald-50 text-emerald-800 border-emerald-200",
  medium: "bg-amber-50 text-amber-900 border-amber-300",
  hard: "bg-rose-50 text-rose-900 border-rose-300",
};

export function RoyalBadge({ label, variant }: { label: string; variant: RoyalBadgeVariant }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold shadow-[inset_0_-1px_0_rgba(140,31,23,0.1)]",
        variantMap[variant],
      )}
    >
      {label}
    </span>
  );
}
