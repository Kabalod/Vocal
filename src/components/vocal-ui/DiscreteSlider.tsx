export function DiscreteSlider({
  min = 1,
  max,
  value,
  onChange,
  valueText,
}: {
  min?: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  valueText: string;
}) {
  if (max <= min) return null;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      aria-valuetext={valueText}
      aria-label={valueText}
      className="w-full accent-[var(--vocal-accent)]"
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}
