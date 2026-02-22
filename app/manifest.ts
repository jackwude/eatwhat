import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI 智能菜谱辅助",
    short_name: "智能菜谱",
    description: "输入食材，获取精准菜谱和采购清单",
    start_url: "/",
    display: "standalone",
    background_color: "#fff9ef",
    theme_color: "#d97706",
    icons: [
      {
        src: "/next.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
