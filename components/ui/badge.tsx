import { clsx } from "clsx";

type BadgeVariant = "easy" | "medium" | "hard";

const variantClass: Record<BadgeVariant, string> = {
  easy: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  hard: "bg-rose-100 text-rose-800",
};

export function Badge({ label, variant }: { label: string; variant: BadgeVariant }) {
  return <span className={clsx("rounded-full px-2 py-1 text-xs font-semibold", variantClass[variant])}>{label}</span>;
}
