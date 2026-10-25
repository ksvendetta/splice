import { cn } from "@/lib/utils";

// Which column the splice rows are ordered by. The user picks one by clicking
// that column's header: the feed position, the circuit ID, or the distribution
// position.
export type SpliceSortMode = "feed" | "circuit" | "dist";

interface SpliceSortHeaderProps {
  label: string;
  mode: SpliceSortMode;
  value: SpliceSortMode;
  onChange: (mode: SpliceSortMode) => void;
  idPrefix: string;
  className?: string;
}

export function SpliceSortHeader({ label, mode, value, onChange, idPrefix, className }: SpliceSortHeaderProps) {
  const active = value === mode;

  return (
    <button
      type="button"
      onClick={() => onChange(mode)}
      aria-pressed={active}
      title={`Sort by ${label.toLowerCase()}`}
      data-testid={`button-sort-${mode}-${idPrefix}`}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1 underline-offset-4 transition-colors hover:text-foreground hover:underline",
        active && "font-semibold text-foreground underline",
        className
      )}
    >
      {label}
      <span className={cn("text-[9px] leading-none", !active && "invisible")} aria-hidden="true">▲</span>
    </button>
  );
}
