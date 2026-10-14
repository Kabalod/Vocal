"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, Lock, Pencil, Sparkles, X } from "lucide-react";
import { ScriptBuildingState } from "./vocal-flows";
import "./desktop-views.css";

const DESKTOP_QUERY = "(min-width:1024px)";

/** True from 1024px up. The desktop screens below replace the mobile/tablet ones only there. */
export function useIsDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(DESKTOP_QUERY);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

export type ScriptVersion = {
  id: string;
  name: string;
  tag?: string;
  date: string;
  text: string[];
  changes: string[];
  isSource?: boolean;
};

export const initialScriptVersions: ScriptVersion[] = [
  {
    id: "v2",
    name: "Версия 2",
    tag: "текущая",
    date: "Сегодня, 10:42 · из диалога",
    text: [
      "Три недели назад я начал бегать по утрам. На третий день мне стало лень, но я всё равно вышел, потому что так уже делал вчера.",
      "Привычка держится не на желании, а на простом первом шаге: надеть кроссовки.",
    ],
    changes: ["Убрал повтор и оставил ваши слова.", "Добавил фразу про первый шаг."],
  },
  {
    id: "v1",
    name: "Версия 1",
    date: "Вчера, 21:15",
    text: [
      "Три недели назад я начал бегать по утрам. На третий день мне стало лень, но я всё равно вышел.",
    ],
    changes: ["Первая сборка из вашего дубля №1."],
  },
  {
    id: "source",
    name: "Основа",
    date: "Дубль №1 · 3 дня назад",
    text: [
      "Три недели назад я начал бегать по утрам. На третий день мне стало лень, но я всё равно вышел, потому что так уже делал вчера.",
    ],
    changes: [],
    isSource: true,
  },
];

/** Mock result of a build: the new version becomes current and older versions lose the "текущая" tag. */
export function withBuiltVersion(versions: ScriptVersion[]): ScriptVersion[] {
  const number = versions.filter((item) => !item.isSource).length + 1;
  const built: ScriptVersion = {
    id: `v${number}`,
    name: `Версия ${number}`,
    tag: "текущая",
    date: "Только что · из диалога",
    text: [
      "Три недели назад я начал бегать по утрам. На третий день мне стало лень, но я всё равно вышел: так уже делал вчера.",
      "Привычка держится не на желании, а на простом первом шаге. Надеть кроссовки — и дальше всё идёт само.",
    ],
    changes: ["Собрал сценарий из ваших ответов в диалоге.", "Сократил заход: сначала событие, потом вывод."],
  };
  return [built, ...versions.map((item) => ({ ...item, tag: undefined }))];
}

/** Script shown in the dialog reader: the newest version, or the source take when there are no versions yet. */
export function readingScript(versions: ScriptVersion[] = initialScriptVersions) {
  const version = versions.find((item) => !item.isSource);
  if (version) return { caption: `Сценарий · ${version.name}`, text: version.text };
  const source = versions.find((item) => item.isSource) ?? initialScriptVersions[initialScriptVersions.length - 1];
  return { caption: "Основа · ваш дубль №1", text: source.text };
}

export function ScriptDesktop({
  locked = false,
  versions,
  building,
  onBuild,
  onCancelBuild,
  onHelp,
}: {
  /** Period resource is spent: building is unavailable, reading and editing text stay. */
  locked?: boolean;
  versions: ScriptVersion[];
  building: boolean;
  onBuild: () => void;
  onCancelBuild: () => void;
  onHelp: () => void;
}) {
  const [selectedId, setSelectedId] = useState(versions[0].id);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [finalId, setFinalId] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(true);
  const newestId = versions[0].id;
  // A freshly built version becomes current and is selected right away.
  useEffect(() => { setSelectedId(newestId); setEditing(false); }, [newestId]);
  const version = versions.find((item) => item.id === selectedId) ?? versions[0];
  const textOf = (item: ScriptVersion) => texts[item.id] ?? item.text.join("\n\n");
  const select = (id: string) => { setSelectedId(id); setEditing(false); };
  return (
    <section className="dk-script-page">
      <aside className="dk-versions" aria-label="Версии сценария">
        <button className="dk-btn dk-btn-primary dk-build" disabled={building || locked} aria-busy={building} onClick={onBuild}>
          {locked ? <Lock /> : <Sparkles />} Собрать новую версию
        </button>
        <h2>Версии</h2>
        <ul>
          {versions.map((item) => (
            <li key={item.id}>
              <button
                className={`dk-version ${item.id === selectedId ? "selected" : ""}`}
                aria-current={item.id === selectedId ? "true" : undefined}
                onClick={() => select(item.id)}
              >
                <span className="dk-version-name">
                  {item.name}
                  {item.tag && <em>{item.tag}</em>}
                  {finalId === item.id && <b>Итоговый</b>}
                </span>
                <span className="dk-version-date">{item.date}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <article className="dk-reader" aria-label={version.name} aria-busy={building}>
        <header>
          <div>
            <span className="dk-eyebrow">{version.name}{version.tag ? ` · ${version.tag}` : ""}</span>
            <h2>Сценарий</h2>
          </div>
          <div className="dk-reader-actions">
            <button
              className="dk-btn dk-btn-secondary"
              disabled={version.isSource || editing || building}
              title={version.isSource ? "Основа — расшифровка вашего дубля" : undefined}
              onClick={() => { setDraft(textOf(version)); setEditing(true); }}
            >
              <Pencil /> Редактировать
            </button>
            <button className="dk-btn dk-btn-ghost" disabled={locked} onClick={onHelp}>{locked ? <Lock /> : <Sparkles />} Помочь со сценарием</button>
            <button
              className="dk-btn dk-btn-primary"
              disabled={version.isSource || finalId === version.id || building}
              onClick={() => setFinalId(version.id)}
            >
              {finalId === version.id ? <><Check /> Итоговый</> : "Сделать итоговым"}
            </button>
          </div>
        </header>
        {hintOpen && !building && !locked && versions.length <= 3 && (
          <div className="dk-hint" role="note">
            <p><strong>Vocal</strong> Я понял так: привычка держится на простом первом шаге, а не на желании. Собрать новую версию?</p>
            <button className="dk-btn dk-btn-primary" onClick={onBuild}><Sparkles /> Собрать новую версию</button>
            <button className="dk-hint-close" aria-label="Закрыть подсказку" onClick={() => setHintOpen(false)}><X /></button>
          </div>
        )}
        {building ? (
          <div className="dk-building"><ScriptBuildingState onCancel={onCancelBuild} /></div>
        ) : editing ? (
          <div className="dk-editor">
            <textarea aria-label="Текст сценария" value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
            <div>
              <button className="dk-btn dk-btn-ghost" onClick={() => setEditing(false)}>Отмена</button>
              <button
                className="dk-btn dk-btn-primary"
                disabled={!draft.trim()}
                onClick={() => { setTexts((previous) => ({ ...previous, [version.id]: draft.trim() })); setEditing(false); }}
              >
                Сохранить
              </button>
            </div>
          </div>
        ) : (
          <div className="dk-reader-text">
            {textOf(version).split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        )}
        {!building && version.changes.length > 0 && (
          <details className="dk-changes" key={version.id}>
            <summary>Что изменено <ChevronDown /></summary>
            <ul>
              {version.changes.map((change) => <li key={change}><Check /> {change}</li>)}
            </ul>
          </details>
        )}
      </article>
    </section>
  );
}
