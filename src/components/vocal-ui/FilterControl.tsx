export function FilterControl({
  items,
  value,
  onChange,
  "aria-label": ariaLabel = "Фильтры",
}: {
  items: readonly { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  "aria-label"?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected}
            className={`min-h-11 rounded-full px-3 text-sm ${
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
