import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const FIELD_CLASS =
  "vocal-input min-h-11 w-full rounded-[var(--vocal-radius-control)] text-sm text-text";

export function Field(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD_CLASS} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${FIELD_CLASS} min-h-24 py-3 ${props.className ?? ""}`} />;
}
