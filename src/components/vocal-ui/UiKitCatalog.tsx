"use client";

import { useState, type ReactNode } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { Composer } from "@/components/vocal-ui/Composer";
import { ConfirmActions, VocalModal } from "@/components/vocal-ui/VocalModal";
import { DiscreteSlider } from "@/components/vocal-ui/DiscreteSlider";
import { EmptyState } from "@/components/vocal-ui/EmptyState";
import { FilterControl } from "@/components/vocal-ui/FilterControl";
import { IconButton } from "@/components/vocal-ui/IconButton";
import { IconDownload, IconMic, IconPlus, IconSend } from "@/components/vocal-ui/icons";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { VOCAL_FILTERS } from "@/components/vocal-ui/kit";
import { ProcessingState } from "@/components/vocal-ui/ProcessingState";
import { ProgressBar } from "@/components/vocal-ui/ProgressBar";
import { SegmentedTabs } from "@/components/vocal-ui/SegmentedTabs";
import { StatusBadge } from "@/components/vocal-ui/StatusBadge";

const STUDIO_TABS = [
  { id: "takes", label: "Дубли" },
  { id: "script", label: "Сценарий" },
  { id: "dialog", label: "Диалог" },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-[family-name:var(--font-display)] text-xl">{title}</h2>
      {children}
    </section>
  );
}

export function UiKitCatalog() {
  const [tab, setTab] = useState("script");
  const [filter, setFilter] = useState("all");
  const [version, setVersion] = useState(2);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-10 pb-16">
      <p className="text-sm text-muted">
        Каталог только для разработки. Иконки — одно SVG-семейство проекта, без Lucide и без API.
      </p>

      <Section title="Кнопки">
        <div className="flex flex-wrap gap-3">
          <ActionButton variant="primary">Новая мысль</ActionButton>
          <ActionButton variant="secondary">Создать новую версию</ActionButton>
          <ActionButton variant="compact">
            <IconDownload />
            Скачать .txt
          </ActionButton>
          <ActionButton variant="danger">Удалить черновик</ActionButton>
          <ActionButton variant="primary" loading loadingLabel="Создаём версию…">
            Создать
          </ActionButton>
          <ActionButton variant="primary" disabled disabledReason="Сначала введите название">
            Продолжить
          </ActionButton>
          <IconButton label="Микрофон">
            <IconMic />
          </IconButton>
          <IconButton label="Отправить">
            <IconSend />
          </IconButton>
        </div>
      </Section>

      <Section title="Статусы и фильтры">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="open" />
          <StatusBadge status="in_progress" />
          <StatusBadge status="completed" />
        </div>
        <FilterControl items={VOCAL_FILTERS} value={filter} onChange={setFilter} />
      </Section>

      <Section title="Сегменты">
        <SegmentedTabs items={STUDIO_TABS} value={tab} onChange={setTab} />
        <p className="text-sm text-muted">Активный сегмент — нейтральная подложка, без champagne-заливки.</p>
      </Section>

      <Section title="Состояния">
        <EmptyState
          title="Пока нет мыслей"
          description="Создайте первую мысль текстом, голосом или видео."
          action={
            <ActionButton variant="primary">
              <IconPlus />
              Новая мысль
            </ActionButton>
          }
        />
        <ProcessingState label="Разбираю вашу мысль…" hint="Старые сообщения остаются на месте." />
        <InlineError message="Нет связи. Не удалось обновить состояние" action={<ActionButton>Повторить</ActionButton>} />
      </Section>

      <Section title="Диалог и ввод">
        <div className="space-y-2">
          <div className="max-w-[92%] rounded-[var(--vocal-radius-panel)] border border-line bg-surface p-3 text-sm">
            <p className="text-xs text-muted">Vocal</p>
            Разбираю вашу мысль…
          </div>
          <div className="ml-auto max-w-[92%] rounded-[var(--vocal-radius-panel)] border border-line bg-field p-3 text-sm">
            <p className="text-xs text-muted">Вы</p>
            Хочу рассказать про утро без спешки.
          </div>
        </div>
        <Composer />
        <Composer disabled error />
      </Section>

      <Section title="Прогресс и ползунок">
        <ProgressBar value={42} label="Файл сохранён · 42%" />
        <p className="text-sm text-muted">Версия {version} из 4</p>
        <DiscreteSlider max={4} value={version} onChange={setVersion} valueText={`Версия ${version} из 4`} />
      </Section>

      <Section title="Dialog и Sheet">
        <div className="flex flex-wrap gap-3">
          <ActionButton variant="secondary" onClick={() => setDialogOpen(true)}>
            Открыть окно
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => setSheetOpen(true)}>
            Открыть панель
          </ActionButton>
          <ActionButton variant="danger" onClick={() => setConfirmOpen(true)}>
            Подтверждение
          </ActionButton>
        </div>
        <VocalModal open={dialogOpen} title="Новая мысль" onClose={() => setDialogOpen(false)}>
          <p className="text-sm text-muted">Текст, записать голос или загрузить видео. Без камеры и без ИИ.</p>
        </VocalModal>
        <VocalModal open={sheetOpen} title="Меню" placement="sheet" onClose={() => setSheetOpen(false)}>
          <p className="text-sm text-muted">Тот же диалог по смыслу: заголовок, закрытие и удержание фокуса.</p>
        </VocalModal>
        <VocalModal open={confirmOpen} title="Удалить черновик?" initialFocus="safe" onClose={() => setConfirmOpen(false)}>
          <p className="text-sm text-muted">Готовые версии не затрагиваются. Закрытие не считается согласием.</p>
          <ConfirmActions
            cancelLabel="Оставить"
            confirmLabel="Удалить черновик"
            onCancel={() => setConfirmOpen(false)}
            onConfirm={() => setConfirmOpen(false)}
          />
        </VocalModal>
      </Section>

      <Section title="Ширина 390">
        <div className="w-full max-w-[390px] space-y-3 overflow-x-hidden rounded-[var(--vocal-radius-panel)] border border-line p-4">
          <SegmentedTabs items={STUDIO_TABS} value={tab} onChange={setTab} />
          <FilterControl items={VOCAL_FILTERS} value={filter} onChange={setFilter} />
          <Composer />
        </div>
      </Section>
    </div>
  );
}
