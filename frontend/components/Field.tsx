export function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[#aaaaaa]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-white/10 bg-[#1c1c1c] px-3.5 py-2.5 text-sm text-white placeholder-[#3d3d3d] outline-none transition focus:border-white/30 focus:ring-1 focus:ring-white/10"
      />
    </label>
  );
}
