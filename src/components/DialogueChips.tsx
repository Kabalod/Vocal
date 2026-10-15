import type { ReactNode } from "react";
import { BUILD_SCRIPT_CHIP_LABEL, DONT_KNOW_CHIPS } from "@/components/thought-desktop";
import { Chip } from "@/components/vocal-ui/Chip";

/**
 * Chips above the desktop composer. "Не помню" and "Пропустить вопрос" send an ordinary text answer through the existing dialogue
 * path (`onSend`, the server recognises "не знаю"); "Собрать сценарий" starts the existing generation (`onBuild`).
 * No hooks and no state: the handlers are the owner's.
 */
export function DialogueChips({
  disabled,
  onSend,
  onBuild,
  scroll = false,
  trailing,
}: {
  scroll?: boolean;
  /** An extra chip at the end of the row (the touch dialogue puts "Записать дубль" there). */
  trailing?: ReactNode;
  disabled: boolean;
  onSend: (text: string) => void;
  onBuild?: () => void;
}) {
  // Touch: 44 px chips (the desktop 30 px pill is the look; here the target is the pill itself).
  const chipClass = scroll ? "!h-11 px-4 !text-sm" : "";
  return (
    <div className={scroll ? "-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [&>*]:shrink-0" : "flex flex-wrap gap-1.5"} data-dialogue-chips>
      {DONT_KNOW_CHIPS.map((chip) => (
        <Chip key={chip.id} className={chipClass} aria-pressed={undefined} disabled={disabled} onClick={() => onSend(chip.text)}>
          {chip.label}
        </Chip>
      ))}
      <Chip selected className={chipClass} aria-pressed={undefined} disabled={disabled || !onBuild} onClick={() => onBuild?.()}>
        {BUILD_SCRIPT_CHIP_LABEL}
      </Chip>
      {trailing}
    </div>
  );
}
