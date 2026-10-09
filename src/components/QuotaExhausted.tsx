"use client";

import { ActionButton } from "@/components/vocal-ui/ActionButton";

/** J1: shown instead of the new-thought form when the paid period's thought limit is used up (HTTP 402 QUOTA_EXHAUSTED). */
export function QuotaExhausted({ periodEnd, onClose }: { periodEnd: string | null; onClose: () => void }) {
  const date = periodEnd ? new Date(periodEnd) : null;
  const label = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <div className="space-y-3" role="alert" data-testid="quota-exhausted">
      <p className="text-base font-medium">Лимит мыслей исчерпан</p>
      <p className="text-sm">
        {label
          ? `Новые мысли можно будет создавать после продления тарифа. Оплаченный период заканчивается ${label}.`
          : "Нет оплаченного периода. Продлите тариф, чтобы создавать новые мысли."}{" "}
        Уже созданные мысли остаются доступными: их можно читать, копировать и скачивать.
      </p>
      <div className="flex gap-2">
        <ActionButton variant="primary" onClick={() => window.location.assign("/settings")}>
          Продлить тариф
        </ActionButton>
        <ActionButton variant="secondary" onClick={onClose}>
          Закрыть
        </ActionButton>
      </div>
    </div>
  );
}
