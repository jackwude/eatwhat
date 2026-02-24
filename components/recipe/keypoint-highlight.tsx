export function KeypointHighlight({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  const normalized = text.replace(/^关键控制[:：]\s*/u, "").trim();
  if (!normalized) return null;
  return (
    <p className="keypoint mt-2 rounded-r-lg px-3 py-2 text-sm font-semibold text-[#7a221a]">
      御膳关键：{normalized}
    </p>
  );
}
