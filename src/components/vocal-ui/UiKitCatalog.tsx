"use client";

import { useState, type ReactNode } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { ActionSheet } from "@/components/vocal-ui/ActionSheet";
import { Chip } from "@/components/vocal-ui/Chip";
import { Composer } from "@/components/vocal-ui/Composer";
import { ConfirmAlert } from "@/components/vocal-ui/ConfirmAlert";
import { IosNavBar } from "@/components/vocal-ui/IosNavBar";
import { MonthCalendar, dateFilterLabel, isoDay, type DateFilterKind, type DatePreset } from "@/components/vocal-ui/MonthCalendar";
import { Sheet } from "@/components/vocal-ui/Sheet";
import { ConfirmActions, VocalModal } from "@/components/vocal-ui/VocalModal";
import { DiscreteSlider } from "@/components/vocal-ui/DiscreteSlider";
import { EmptyState } from "@/components/vocal-ui/EmptyState";
import { Field, TextArea } from "@/components/vocal-ui/Field";
import { Panel } from "@/components/vocal-ui/Panel";
import { FilterControl } from "@/components/vocal-ui/FilterControl";
import { IconButton } from "@/components/vocal-ui/IconButton";
import { IconDownload, IconMic, IconPlus, IconSend } from "@/components/vocal-ui/icons";
import { Copy, FileText, MessageCircle } from "lucide-react";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { VOCAL_FILTERS } from "@/components/vocal-ui/kit";
import { ProcessingState } from "@/components/vocal-ui/ProcessingState";
import { ProgressBar } from "@/components/vocal-ui/ProgressBar";
import { SegmentedTabs } from "@/components/vocal-ui/SegmentedTabs";
import { StatusBadge } from "@/components/vocal-ui/StatusBadge";

const ICON_TABS = [
  { id: "takes", label: "Дубли", hint: "Дубли", icon: <Copy size={16} strokeWidth={1.5} /> },
  { id: "dialog", label: "Диалог", hint: "Диалог", icon: <MessageCircle size={16} strokeWidth={1.5} /> },
  { id: "script", label: "Сценарий", hint: "Сценарий", icon: <FileText size={16} strokeWidth={1.5} /> },
] as const;

const MARKED = new Set(["2026-10-02", "2026-10-07", "2026-10-09", "2026-10-13", "2026-10-14"]);

const STUDIO_TABS = [
  { id: "takes", label: "Дубли" },
  { id: "dialog", label: "Диалог" },
  { id: "script", label: "Сценарий" },
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
  const [iconTab, setIconTab] = useState("dialog");
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [lastAction, setLastAction] = useState("—");
  const [chips, setChips] = useState(["Октябрь 2026", "Не завершена"]);
  const [chipOn, setChipOn] = useState(true);
  const [calendar, setCalendar] = useState<{ year: number; month: number; filter: DateFilterKind; day: string; monthValue: string }>({
    year: 2026,
    month: 9,
    filter: "range",
    day: "2026-10-09",
    monthValue: "",
  });

  return (
    <div className="space-y-10 pb-16">
      <p className="text-sm text-muted">
        Каталог только для разработки, без обращения к API. Иконки действий — lucide-react (штрих 1,5), иконки статусов — свои.
      </p>

      <Section title="Кнопки">
        <div className="flex flex-wrap gap-3">
          <ActionButton variant="primary">Новая мысль</ActionButton>
          <ActionButton variant="secondary">Создать новую версию</ActionButton>
          <ActionButton variant="ghost">
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
          <IconButton variant="microphone" label="Микрофон">
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
        <SegmentedTabs items={STUDIO_TABS} value={tab} onChange={setTab} aria-label="Текстовые вкладки" />
        <p className="text-sm text-muted">Активный сегмент — нейтральная подложка, без champagne-заливки.</p>
        <SegmentedTabs variant="icon" items={ICON_TABS} value={iconTab} onChange={setIconTab} aria-label="Вкладки-иконки" />
        <p className="text-sm text-muted">Иконки 36×28 с подсказкой и именем для скринридера; зона нажатия 44 px.</p>
      </Section>

      <Section title="Чипы">
        <div className="flex flex-wrap items-center gap-2">
          <Chip selected={chipOn} onClick={() => setChipOn((v) => !v)}>
            Сегодня
          </Chip>
          <Chip>Вчера</Chip>
          {chips.map((label) => (
            <Chip key={label} selected onRemove={() => setChips((list) => list.filter((item) => item !== label))}>
              {label}
            </Chip>
          ))}
          {chips.length === 0 ? <ActionButton variant="ghost" onClick={() => setChips(["Октябрь 2026", "Не завершена"])}>Вернуть чипы</ActionButton> : null}
        </div>
      </Section>

      <Section title="Календарь месяца">
        <Panel className="max-w-xs">
          <MonthCalendar
            year={calendar.year}
            month={calendar.month}
            marked={MARKED}
            today="2026-10-14"
            dateFilter={calendar.filter}
            rangeStart={calendar.day}
            monthValue={calendar.monthValue}
            onMonthChange={(year, month) => setCalendar((c) => ({ ...c, year, month }))}
            onPreset={(preset: DatePreset) => setCalendar((c) => ({ ...c, filter: preset, day: "" }))}
            onDay={(iso) => setCalendar((c) => ({ ...c, filter: "range", day: iso }))}
            onWholeMonth={() => setCalendar((c) => ({ ...c, filter: "month", monthValue: isoDay(c.year, c.month, 1).slice(0, 7), day: "" }))}
            onReset={() => setCalendar((c) => ({ ...c, filter: "all", day: "", monthValue: "" }))}
          />
        </Panel>
        <p className="text-sm text-muted">Фильтр: {dateFilterLabel(calendar.filter, calendar.day, calendar.monthValue) || "все даты"}</p>
      </Section>

      <Section title="Навигация iOS">
        <div className="max-w-sm overflow-hidden rounded-[var(--vocal-radius-panel)] border border-line">
          <IosNavBar title="Привычка и мотивация" backLabel="Мысли" onBack={() => undefined} titleVisible={false} />
          <p className="p-4 text-sm text-muted">Заголовок скрыт, пока крупный заголовок страницы на экране.</p>
        </div>
        <div className="max-w-sm overflow-hidden rounded-[var(--vocal-radius-panel)] border border-line">
          <IosNavBar title="Привычка и мотивация" backLabel="Мысли" onBack={() => undefined} titleVisible />
          <p className="p-4 text-sm text-muted">После прокрутки заголовок появляется в панели.</p>
        </div>
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

      <Section title="Панель и поля">
        <Panel className="max-w-md space-y-3">
          <Field aria-label="Короткое поле" placeholder="Название" readOnly />
          <TextArea aria-label="Длинное поле" placeholder="Цитата или сценарий" className="font-content" readOnly />
        </Panel>
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
        <ProgressBar value={42} label="Ресурс · 42%" tone="usage" showValue />
        <ProgressBar value={76} label="Ресурс · 76%: предупреждение" tone="usage" showValue />
        <ProgressBar value={93} label="Ресурс · 93%: почти исчерпан" tone="usage" showValue />
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
          <ActionButton variant="secondary" onClick={() => setBottomSheetOpen(true)}>
            Нижний лист
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => setActionSheetOpen(true)}>
            Список действий
          </ActionButton>
          <ActionButton variant="danger" onClick={() => setAlertOpen(true)}>
            Окно подтверждения
          </ActionButton>
        </div>
        <p className="text-sm text-muted">Последнее действие: {lastAction}</p>
        <Sheet open={bottomSheetOpen} title="Дата" onClose={() => setBottomSheetOpen(false)}>
          <p className="text-sm text-muted">Нижний лист с ручкой, Esc и клик по фону закрывают, фокус остаётся внутри.</p>
          <div className="mt-3">
            <ActionButton variant="primary" onClick={() => setBottomSheetOpen(false)}>
              Готово
            </ActionButton>
          </div>
        </Sheet>
        <ActionSheet
          open={actionSheetOpen}
          title="Мысль"
          message="Что сделать с этой мыслью?"
          actions={[
            { id: "record", label: "Записать дубль" },
            { id: "export", label: "Скачать .txt" },
            { id: "delete", label: "Удалить мысль", destructive: true },
          ]}
          onSelect={(id) => setLastAction(id)}
          onClose={() => setActionSheetOpen(false)}
        />
        <ConfirmAlert
          open={alertOpen}
          title="Удалить мысль?"
          message="Дубли и сценарии будут удалены без возможности восстановить."
          confirmLabel="Удалить"
          destructive
          onConfirm={() => {
            setLastAction("confirm");
            setAlertOpen(false);
          }}
          onCancel={() => {
            setLastAction("cancel");
            setAlertOpen(false);
          }}
        />
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
