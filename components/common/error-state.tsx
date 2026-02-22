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
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <h3 className="text-base font-semibold text-red-900">{title}</h3>
      <p className="mt-2 text-sm text-red-800">{description}</p>
      <Button className="mt-4 bg-red-700 hover:bg-red-800" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
