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
      <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[#5a8fc4]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#1a3a6e]/60 bg-[#060f26] px-4 py-3.5 text-sm text-[#ddeeff] placeholder-[#3a5a8a] outline-none transition focus:border-[#5b9eff]/60 focus:ring-1 focus:ring-[#5b9eff]/20"
      />
    </label>
  );
}
