import { useId, useState, type FormEvent } from "react";
import { IconMic, IconSend } from "@/components/vocal-ui/icons";
import { IconButton } from "@/components/vocal-ui/IconButton";
import { ActionButton } from "@/components/vocal-ui/ActionButton";

export function Composer({
  placeholder = "Напишите ответ…",
  disabled = false,
  error = false,
  onSend,
  onMic,
}: {
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  onSend?: (text: string) => void;
  onMic?: () => void;
}) {
  const fieldId = useId();
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0 && !disabled;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    onSend?.(value.trim());
    setValue("");
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="sr-only" htmlFor={fieldId}>
        Сообщение
      </label>
      <textarea
        id={fieldId}
        className={`vocal-input min-h-11 max-h-40 resize-none ${error ? "border-bad" : ""}`}
        rows={2}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit(event);
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <IconButton label="Записать голос" disabled={disabled} onClick={onMic}>
          <IconMic />
        </IconButton>
        <ActionButton type="submit" variant="primary" disabled={!canSend} disabledReason={!canSend ? "Введите текст" : undefined}>
          <IconSend />
          Отправить
        </ActionButton>
      </div>
    </form>
  );
}
