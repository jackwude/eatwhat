import type { Metadata } from "next";
import { Noto_Sans_SC, Source_Serif_4 } from "next/font/google";
import "@/app/globals.css";
import { Providers } from "@/app/providers";

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-noto-sans-sc",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
});

export const metadata: Metadata = {
  title: "AI 智能菜谱辅助",
  description: "输入现有食材，智能推荐菜谱并生成采购清单",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${notoSansSC.variable} ${sourceSerif.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
