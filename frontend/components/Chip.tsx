export function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1a3a6e]/50 bg-[#060f26]/80 px-2.5 py-1 text-xs font-medium text-[#ddeeff]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}