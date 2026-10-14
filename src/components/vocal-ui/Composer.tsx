import { useId, useState, type FormEvent } from "react";
import { IconMic, IconSend } from "@/components/vocal-ui/icons";
import { IconButton } from "@/components/vocal-ui/IconButton";

/**
 * A pill: the field and ONE button on the right. Empty field: the microphone; text typed: the arrow (send). The hint under the pill
 * says how Enter works. Enter sends, Shift+Enter is a new line, IME composition never sends.
 */
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
  const hintId = useId();
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
    <form onSubmit={submit} className="min-w-0 space-y-1.5">
      <div
        className={`flex min-h-11 items-end gap-1 rounded-[24px] border-[0.5px] bg-surface py-1 pl-4 pr-1 ${
          error ? "border-bad" : "border-line-strong"
        } focus-within:border-accent-soft`}
      >
        <label className="sr-only" htmlFor={fieldId}>
          Сообщение
        </label>
        <textarea
          id={fieldId}
          className="max-h-40 min-h-9 min-w-0 flex-1 resize-none self-center bg-transparent py-1.5 text-base text-text outline-none placeholder:text-muted disabled:opacity-50"
          rows={1}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-describedby={hintId}
          aria-invalid={error || undefined}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(event);
            }
          }}
        />
        {canSend ? (
          <IconButton type="submit" variant="microphone" label="Отправить" className="rounded-full">
            <IconSend />
          </IconButton>
        ) : (
          <IconButton label={micLabel} disabled={disabled} onClick={onMic} className="rounded-full">
            <IconMic />
          </IconButton>
        )}
      </div>
      <p id={hintId} className="px-4 text-xs text-muted">
        Enter — отправить, Shift+Enter — новая строка
      </p>
    </form>
  );
}
