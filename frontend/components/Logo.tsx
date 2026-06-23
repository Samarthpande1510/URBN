export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  // Placeholder mark approximating the provided logo. Swap for the real
  // logo file (e.g. an <img src="/logo.svg" />) whenever it's ready.
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M55 50 L55 25 A15 15 0 0 1 85 25 L85 50 Z" fill="white" />
      <path d="M15 50 L45 50 L45 75 A15 15 0 0 1 15 75 Z" fill="white" />
    </svg>
  );
}
