import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 测试期间关闭真实出图，统一返回固定占位图，避免消耗图片模型额度。
export async function POST() {
  return NextResponse.json({ imageUrl: "/placeholder-dish.svg", disabled: true });
}
