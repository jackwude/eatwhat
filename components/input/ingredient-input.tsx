type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function IngredientInput({ value, onChange }: Props) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium tracking-[0.12em] text-[color:var(--royal-red)]">奏报现有食材</span>
      <textarea
        className="w-full rounded-2xl border border-[#cfb380] bg-[#fff8e7] p-4 text-base text-[color:var(--ink)] outline-none transition focus:border-[color:var(--royal-red)] focus:ring-2 focus:ring-[#e6ca88]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例如：西红柿 鸡蛋 小葱（可写准备购买的食材）"
        rows={4}
      />
    </label>
  );
}
