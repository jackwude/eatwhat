export function KeypointHighlight({ text }: { text: string }) {
  return (
    <p className="keypoint mt-2 rounded-r-lg px-3 py-2 text-sm font-semibold text-[#7a221a]">
      御膳关键：{text}
    </p>
  );
}
