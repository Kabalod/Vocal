export function FilterControl({
  items,
  value,
  onChange,
  className = "flex flex-wrap gap-2",
  "aria-label": ariaLabel = "Фильтры",
}: {
  items: readonly { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={className}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected}
            className={`min-h-11 w-full rounded-full px-3 text-center text-sm leading-tight shell:w-auto ${
              selected ? "border border-accent bg-bg text-text" : "border border-line bg-surface text-muted hover:text-text"
            }`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
