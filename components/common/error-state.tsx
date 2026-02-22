import { Button } from "@/components/ui/button";

export function ErrorState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <h3 className="text-base font-semibold text-[color:var(--royal-red)]">{title}</h3>
      <p className="mt-2 text-sm text-[#6f332d]">{description}</p>
      <Button className="mt-4 border-[#6d1f18] bg-[linear-gradient(180deg,#a83a2f_0%,#8c1f17_100%)] text-[#fff4e4] shadow-[0_4px_0_#5d140f,0_10px_20px_rgba(53,27,7,0.22)] hover:brightness-110" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
