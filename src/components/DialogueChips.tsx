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
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  onBuild?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" data-dialogue-chips>
      {DONT_KNOW_CHIPS.map((chip) => (
        <Chip key={chip.id} aria-pressed={undefined} disabled={disabled} onClick={() => onSend(chip.text)}>
          {chip.label}
        </Chip>
      ))}
      <Chip selected aria-pressed={undefined} disabled={disabled || !onBuild} onClick={() => onBuild?.()}>
        {BUILD_SCRIPT_CHIP_LABEL}
      </Chip>
    </div>
  );
}
