"use client";

import { ShellError } from "@/components/shell-status";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ reset }: AppErrorProps) {
  return <ShellError message="Не удалось открыть экран." onRetry={reset} />;
}
