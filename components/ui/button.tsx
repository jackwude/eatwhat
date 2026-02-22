import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className, ...props }: Props) {
  return (
    <button
      className={clsx(
        "inline-flex h-11 items-center justify-center rounded-xl border border-[#7c251b] bg-[linear-gradient(180deg,#e8c15c_0%,#dca73f_100%)] px-4 text-sm font-semibold text-[#2c1207] shadow-[0_4px_0_#8c1f17,0_10px_20px_rgba(53,27,7,0.22)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-[#c6aa72] disabled:bg-[#e2d6bd] disabled:text-[#8b7d65] disabled:shadow-none",
        className,
      )}
      {...props}
    />
  );
}
