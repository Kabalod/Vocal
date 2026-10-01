import { useId, useState, type FormEvent } from "react";
import { IconMic, IconSend } from "@/components/vocal-ui/icons";
import { IconButton } from "@/components/vocal-ui/IconButton";
import { ActionButton } from "@/components/vocal-ui/ActionButton";

export function Composer({
  placeholder = "Напишите ответ…",
  disabled = false,
  error = false,
  value,
  onChange,
  onSend,
  onMic,
  micLabel = "Записать голос",
  clearOnSend = true,
  autoFocus = false,
}: {
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSend?: (text: string) => void;
  onMic?: () => void;
  micLabel?: string;
  clearOnSend?: boolean;
  autoFocus?: boolean;
}) {
  const fieldId = useId();
  const [inner, setInner] = useState("");
  const text = value ?? inner;
  function setText(next: string) {
    if (value === undefined) setInner(next);
    onChange?.(next);
  }
  const canSend = text.trim().length > 0 && !disabled;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    onSend?.(text.trim());
    if (clearOnSend) setText("");
  }

  return (
    <form onSubmit={submit} className="min-w-0 space-y-2">
      <label className="sr-only" htmlFor={fieldId}>
        Сообщение
      </label>
      <textarea
        id={fieldId}
        className={`vocal-input min-h-11 max-h-40 resize-none ${error ? "border-bad" : ""}`}
        rows={2}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit(event);
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <IconButton variant="microphone" label={micLabel} disabled={disabled} onClick={onMic}>
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
