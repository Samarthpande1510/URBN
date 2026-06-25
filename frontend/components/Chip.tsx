export function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}