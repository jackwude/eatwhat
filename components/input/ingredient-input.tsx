type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function IngredientInput({ value, onChange }: Props) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">输入你现有的食材</span>
      <textarea
        className="w-full rounded-2xl border border-amber-200 bg-white p-4 text-base outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例如：西红柿 鸡蛋 小葱"
        rows={4}
      />
    </label>
  );
}
