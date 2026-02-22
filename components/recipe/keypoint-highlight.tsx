export function KeypointHighlight({ text }: { text: string }) {
  return (
    <p className="keypoint mt-2 rounded-r-lg px-3 py-2 text-sm font-semibold text-amber-900">
      关键点：{text}
    </p>
  );
}
