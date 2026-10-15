"use client";

import Link from "next/link";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { EmptyState } from "@/components/vocal-ui/EmptyState";
import { InlineError } from "@/components/vocal-ui/InlineError";

function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--vocal-radius-control)] bg-surface ${className}`} />;
}

/**
 * Skeletons instead of a spinner: `list` (library: a grid of upright polaroids), `thought` (title, tabs, a work panel),
 * `page` (a title and two panels). The label stays in the markup for assistive technology.
 */
export function ShellLoading({
  label = "Загрузка…",
  variant = "page",
}: {
  label?: string;
  variant?: "list" | "thought" | "page";
}) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true" data-shell-loading={variant}>
      {variant === "list" ? (
        <>
          <Bone className="h-8 w-48" />
          <div className="grid grid-cols-2 gap-4 shell:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Bone key={index} className="aspect-[3/4] rounded-panel" />
            ))}
          </div>
        </>
      ) : variant === "thought" ? (
        <>
          <Bone className="h-8 w-2/3 max-w-md" />
          <Bone className="h-11 w-full max-w-sm" />
          <Bone className="h-64 w-full rounded-panel" />
          <Bone className="h-12 w-full" />
        </>
      ) : (
        <>
          <Bone className="h-8 w-40" />
          <Bone className="h-40 w-full rounded-panel" />
          <Bone className="h-24 w-full rounded-panel" />
        </>
      )}
      <p className="sr-only">{label}</p>
    </div>
  );
}

export function ShellError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <InlineError
      message={message}
      action={
        onRetry ? (
          <ActionButton variant="secondary" onClick={onRetry}>
            Повторить
          </ActionButton>
        ) : undefined
      }
    />
  );
}

export function ShellEmpty({ title, description, href, hrefLabel }: { title: string; description?: string; href?: string; hrefLabel?: string }) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        href ? (
          <Link href={href} className="vocal-btn inline-flex min-h-11 items-center">
            {hrefLabel ?? "К мыслям"}
          </Link>
        ) : undefined
      }
    />
  );
}
