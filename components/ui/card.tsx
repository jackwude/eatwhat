import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: Props) {
  return <div className={clsx("glass-card rounded-2xl p-5", className)} {...props} />;
}
