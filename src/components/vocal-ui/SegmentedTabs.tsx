export function SegmentedTabs({
  items,
  value,
  onChange,
  "aria-label": ariaLabel = "Вкладки",
}: {
  items: readonly { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex min-h-11 rounded-[var(--vocal-radius-control)] bg-bg p-1"
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`min-h-11 min-w-0 flex-1 rounded-[8px] px-3 text-sm ${
              selected ? "border border-line bg-field text-text" : "border border-transparent text-muted hover:text-text"
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
