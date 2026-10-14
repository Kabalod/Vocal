"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  CreditCard,
  Landmark,
  LogOut,
  Mic,
  Settings,
  Square,
  Trash2,
} from "lucide-react";
import { ResourceMeter, wholePercent } from "./resource";
import "./account.css";

export type Sub = "active" | "none" | "expired";
export type PayMethod = "card" | "sbp";
export type PayStatus = "select" | "processing" | "success" | "failed";
export type PaymentRow = { date: string; amount: string; status: "Оплачено" | "Возврат" };

/** Non-breaking spaces keep "1 490 ₽" on one line. */
export const PRICE = "1\u00a0490\u00a0₽";

/** Focus trap + Esc for dialogs and sheets; focus returns to the opener on close. */
function useDialog(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0])?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!node.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [ref]);
}

function Modal({
  id,
  title,
  onClose,
  children,
  alert = false,
}: {
  id: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  alert?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  useDialog(panel, onClose);
  return (
    <div className="ac-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panel} className="ac-modal" role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={id}>
        <span className="ac-handle" aria-hidden="true" />
        <h2 id={id}>{title}</h2>
        {children}
      </section>
    </div>
  );
}

const portrait = [
  "Артём Лесной снимает короткие видео о привычках и о людях, которые их меняют. Начинал с заметок в телефоне: записывал фразы, которые слышал в метро, на кухнях друзей, в разговорах после работы, и однажды понял, что из них складывается его главная тема.",
  "Он пришёл в блог из продуктовой команды, где годами объяснял сложное простыми словами. Там же понял, что люди запоминают не советы, а честные истории: как стало лень на третий день и что помогло всё равно выйти из дома.",
  "Артёма интересуют маленькие первые шаги, а не громкие решения: надеть кроссовки, открыть документ, написать одно предложение. Он не продаёт методики и не обещает быстрых результатов, поэтому его видео звучат как разговор, а не как лекция.",
  "Сейчас он собирает серию о том, почему привычка остаётся, когда мотивация исчезла, и ищет в каждой истории одну ясную мысль, которую можно сказать вслух за минуту.",
];

type ModalName = "add" | "cancel" | "refund" | "history" | "delete" | null;

export function ProfilePage({
  sub,
  until,
  resource,
  autoRenew,
  method,
  history,
  onBack,
  onRenew,
  onChangeMethod,
  onAutoRenew,
}: {
  sub: Sub;
  until: string;
  /** Remaining period resource, percent. */
  resource: number;
  autoRenew: boolean;
  method: PayMethod;
  history: PaymentRow[];
  onBack: () => void;
  onRenew: () => void;
  onChangeMethod: () => void;
  onAutoRenew: (value: boolean) => void;
}) {
  const [modal, setModal] = useState<ModalName>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [dictating, setDictating] = useState(false);
  const [reason, setReason] = useState("");
  const [refundSent, setRefundSent] = useState(false);
  const [added, setAdded] = useState(false);
  const close = () => { setModal(null); setDictating(false); };
  const used = 100 - wholePercent(resource);
  const active = sub === "active";
  const status =
    sub === "active" ? `Активна до ${until}${autoRenew ? "" : " · не продлевается"}` : sub === "none" ? "Не оплачена" : "Закончилась 12.10";
  const methodLabel = method === "card" ? "Карта •••• 4242" : "СБП";
  const toggleDictation = () => {
    if (dictating) {
      setAnswer((value) => `${value}${value.trim() ? " " : ""}Весной прошлого года я переехал и заново выстроил утро.`);
    }
    setDictating(!dictating);
  };
  const saveAnswer = () => {
    const text = answer.trim().replace(/\s+/g, " ").slice(0, 220);
    if (!text) return;
    setExtras((previous) => [...previous, `«${text}» — так сам Артём описывает этот период.`]);
    setAdded(true);
    setAnswer("");
    close();
  };
  return (
    <main className="ac-page">
      <header className="ac-bar">
        <button className="ac-back" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
          <span className="ac-back-long">Все мысли</span>
          <span className="ac-back-short">Мысли</span>
        </button>
        <span className="ac-bar-title">Профиль</span>
      </header>
      <div className="ac-grid">
        <article className="ac-portrait">
          <div className="ac-head">
            <div className="ac-avatar" aria-hidden="true">АЛ</div>
            <div>
              <h1>Артём Лесной</h1>
              <p className="ac-mail">artem.lesnoy@example.com</p>
            </div>
          </div>
          <div className="ac-bio">
            {portrait.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {extras.map((paragraph, index) => <p key={`extra-${index}`} className="ac-bio-new">{paragraph}</p>)}
          </div>
          <footer>
            <p role="status">{added ? "Ответ учтён: абзац добавлен в портрет." : "Портрет пишется как биография со стороны. Дополнения — через короткий диалог с Vocal."}</p>
            <button className="ac-btn ac-btn-primary" onClick={() => setModal("add")}>Дополнить о себе</button>
          </footer>
        </article>
        <aside className="ac-side">
          <section className="ac-sub" aria-labelledby="ac-sub-title">
            <div className="ac-sub-head">
              <h2 id="ac-sub-title">Подписка</h2>
              <span className={`ac-status ${sub}`}><i aria-hidden="true" />{status}</span>
            </div>
            <ResourceMeter percent={resource} />
            {active && (
              <div className="ac-switch-row">
                <div>
                  <strong id="ac-auto-label">Автопродление</strong>
                  <small>{autoRenew ? `Следующее списание ${PRICE} ${until}` : `Подписка закончится ${until}`}</small>
                </div>
                <button
                  className="ac-switch"
                  role="switch"
                  aria-checked={autoRenew}
                  aria-labelledby="ac-auto-label"
                  onClick={() => onAutoRenew(!autoRenew)}
                ><i /></button>
              </div>
            )}
            <div className="ac-card-row">
              <span><CreditCard aria-hidden="true" />{methodLabel}</span>
              <button className="ac-link" onClick={onChangeMethod}>Изменить</button>
            </div>
            <div className="ac-actions">
              <button className="ac-btn ac-btn-primary" onClick={onRenew}>Продлить</button>
              {active && autoRenew && <button className="ac-btn ac-btn-ghost" onClick={() => setModal("cancel")}>Отменить подписку</button>}
            </div>
            <div className="ac-links">
              <button className="ac-link" onClick={() => setModal("history")}>История платежей</button>
              {active && <button className="ac-link" onClick={() => { setRefundSent(false); setReason(""); setModal("refund"); }}>Вернуть деньги</button>}
            </div>
          </section>
          <div className="ac-rows">
            <button><Settings aria-hidden="true" /> Настройки</button>
            <button><LogOut aria-hidden="true" /> Выйти</button>
            <button className="danger" onClick={() => setModal("delete")}><Trash2 aria-hidden="true" /> Удалить аккаунт</button>
          </div>
        </aside>
      </div>

      {modal === "add" && (
        <Modal id="ac-add-title" title="Дополнить о себе" onClose={close}>
          <label htmlFor="ac-answer" className="ac-question">Что в вашей жизни за последний год изменило ваш взгляд на привычки?</label>
          <div className="ac-answer">
            <textarea id="ac-answer" data-autofocus value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={dictating ? "Говорите, я слушаю…" : "Расскажите своими словами"} />
            <button
              className={`ac-mic ${dictating ? "on" : ""}`}
              aria-label={dictating ? "Остановить запись ответа" : "Продиктовать ответ"}
              aria-pressed={dictating}
              onClick={toggleDictation}
            >
              {dictating ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
            </button>
          </div>
          <div className="ac-modal-actions">
            <button className="ac-btn ac-btn-ghost" onClick={close}>Отмена</button>
            <button className="ac-btn ac-btn-primary" disabled={!answer.trim()} onClick={saveAnswer}>Сохранить</button>
          </div>
        </Modal>
      )}
      {modal === "cancel" && (
        <Modal id="ac-cancel-title" title="Отменить подписку?" onClose={close} alert>
          <p>Доступ сохранится до {until}, новых списаний не будет</p>
          <div className="ac-modal-actions">
            <button className="ac-btn ac-btn-ghost" data-autofocus onClick={close}>Отмена</button>
            <button className="ac-btn ac-btn-danger" onClick={() => { onAutoRenew(false); close(); }}>Отменить подписку</button>
          </div>
        </Modal>
      )}
      {modal === "refund" && (
        <Modal id="ac-refund-title" title="Вернуть деньги" onClose={close}>
          {refundSent ? (
            <>
              <p role="status">Запрос отправлен, ответим на почту</p>
              <div className="ac-modal-actions">
                <button className="ac-btn ac-btn-primary" data-autofocus onClick={close}>Закрыть</button>
              </div>
            </>
          ) : (
            <>
              <p>Вы использовали {used}% ресурса на период. Можно вернуть оплату за неиспользованную часть периода. Сумма будет рассчитана после проверки</p>
              <label htmlFor="ac-reason" className="ac-question">Причина (необязательно)</label>
              <textarea id="ac-reason" className="ac-plain" data-autofocus value={reason} onChange={(event) => setReason(event.target.value)} />
              <div className="ac-modal-actions">
                <button className="ac-btn ac-btn-ghost" onClick={close}>Отмена</button>
                <button className="ac-btn ac-btn-primary" onClick={() => setRefundSent(true)}>Отправить запрос</button>
              </div>
            </>
          )}
        </Modal>
      )}
      {modal === "history" && (
        <Modal id="ac-history-title" title="История платежей" onClose={close}>
          {history.length ? (
            <ul className="ac-history">
              {history.map((row) => (
                <li key={`${row.date}-${row.status}`}>
                  <span>{row.date}</span>
                  <span>{row.amount}</span>
                  <em className={row.status === "Возврат" ? "refund" : ""}>{row.status}</em>
                </li>
              ))}
            </ul>
          ) : (
            <p>Платежей пока нет</p>
          )}
          <div className="ac-modal-actions">
            <button className="ac-btn ac-btn-ghost" data-autofocus onClick={close}>Закрыть</button>
          </div>
        </Modal>
      )}
      {modal === "delete" && (
        <Modal id="ac-delete-title" title="Удалить аккаунт?" onClose={close} alert>
          <p>Мысли, дубли и сценарии будут удалены. Активная подписка будет отменена</p>
          <div className="ac-modal-actions">
            <button className="ac-btn ac-btn-ghost" data-autofocus onClick={close}>Отмена</button>
            <button className="ac-btn ac-btn-danger" onClick={close}>Удалить</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

const planItems = [
  "Ресурс Vocal на 30 дней",
  "Голос и видео, расшифровка",
  "Диалог с Vocal и сборка сценария без ограничений внутри мысли",
  "Все мысли остаются доступны после окончания периода",
];

export function PaymentScreen({
  mode,
  initialStatus,
  method: savedMethod,
  onBack,
  onPaid,
  onMethodSaved,
  onToLibrary,
}: {
  mode: "subscribe" | "change-method";
  initialStatus: PayStatus;
  method: PayMethod;
  onBack: () => void;
  onPaid: (autoRenew: boolean) => void;
  onMethodSaved: (method: PayMethod) => void;
  onToLibrary: () => void;
}) {
  const subscribe = mode === "subscribe";
  const [status, setStatus] = useState<PayStatus>(initialStatus);
  const [method, setMethod] = useState<PayMethod>(savedMethod);
  const [agree, setAgree] = useState(false);
  // A status taken from ?pay= stays put until the user acts, so the screen can be reviewed.
  const [auto, setAuto] = useState(initialStatus === "select");
  const panel = useRef<HTMLElement>(null);
  const done = useRef(false);
  useDialog(panel, onBack);
  useEffect(() => {
    if (status !== "processing" || !auto) return;
    const timer = window.setTimeout(() => setStatus("success"), 1800);
    return () => window.clearTimeout(timer);
  }, [status, auto]);
  useEffect(() => {
    if (status !== "success" || done.current) return;
    done.current = true;
    if (subscribe) onPaid(agree);
    else onMethodSaved(method);
  }, [status, subscribe, method, agree, onPaid, onMethodSaved]);
  const pay = () => { setAuto(true); done.current = false; setStatus("processing"); };
  return (
    <main ref={panel} className="ac-page ac-pay" role="dialog" aria-modal="true" aria-label={subscribe ? "Подписка Vocal" : "Способ оплаты"}>
      <button className="ac-grabber" aria-label="Закрыть" onClick={onBack}><span /></button>
      <header className="ac-bar">
        <button className="ac-back" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
          <span>Назад</span>
        </button>
      </header>
      <div className="ac-pay-body">
        {status === "select" && (
          <>
            <h1>{subscribe ? "Подписка Vocal" : "Способ оплаты"}</h1>
            {subscribe && (
              <section className="ac-plan" aria-label="Тариф">
                <p className="ac-price"><strong>{PRICE}</strong> в месяц</p>
                <ul>
                  {planItems.map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}
                </ul>
                <small>Обычно хватает на 100+ мыслей с диалогом и сценариями</small>
                <small>Период 30 дней с даты оплаты</small>
              </section>
            )}
            <section className="ac-method" aria-labelledby="ac-method-title">
              <h2 id="ac-method-title">Способ оплаты</h2>
              <div className="ac-segment" role="radiogroup" aria-label="Способ оплаты">
                <button role="radio" aria-checked={method === "card"} className={method === "card" ? "on" : ""} onClick={() => setMethod("card")}><CreditCard aria-hidden="true" />Карта</button>
                <button role="radio" aria-checked={method === "sbp"} className={method === "sbp" ? "on" : ""} onClick={() => setMethod("sbp")}><Landmark aria-hidden="true" />СБП</button>
              </div>
              <p className="ac-hint">{method === "card" ? "Откроется защищённая форма банка" : "Откроется приложение банка"}</p>
            </section>
            {subscribe && (
              <label className="ac-check">
                <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
                <span>Согласен на автопродление: {PRICE} каждые 30 дней. Отключить можно в профиле в любой момент</span>
              </label>
            )}
            <div className="ac-pay-foot">
              <button className="ac-btn ac-btn-primary ac-btn-wide" onClick={pay}>{subscribe ? `Оплатить ${PRICE}` : "Сохранить способ"}</button>
              {subscribe && (
                <p className="ac-legal"><button className="ac-link">Оферта</button><span aria-hidden="true">·</span><button className="ac-link">Политика возврата</button></p>
              )}
            </div>
          </>
        )}
        {status === "processing" && (
          <div className="ac-state" role="status">
            <span className="spinner" aria-hidden="true" />
            <h1>Подтверждаем оплату…</h1>
            <p>Не закрывайте страницу</p>
          </div>
        )}
        {status === "success" && (
          <div className="ac-state" role="status">
            <span className="ac-state-icon ok"><Check aria-hidden="true" /></span>
            <h1>{subscribe ? "Оплата прошла" : "Способ оплаты обновлён"}</h1>
            <p>{subscribe ? "Ресурс на период: 100% · до 12.12" : method === "card" ? "Карта •••• 4242" : "СБП"}</p>
            {subscribe && !agree && <p className="ac-state-note">Автопродление выключено, включить можно в профиле</p>}
            <button className="ac-btn ac-btn-primary ac-btn-wide" data-autofocus onClick={subscribe ? onToLibrary : onBack}>{subscribe ? "К мыслям" : "В профиль"}</button>
          </div>
        )}
        {status === "failed" && (
          <div className="ac-state" role="alert">
            <span className="ac-state-icon bad"><AlertTriangle aria-hidden="true" /></span>
            <h1>Платёж не прошёл</h1>
            <p>Деньги не списаны. Попробуйте ещё раз или выберите другой способ</p>
            <div className="ac-state-actions">
              <button className="ac-btn ac-btn-primary" data-autofocus onClick={pay}>Повторить</button>
              <button className="ac-btn ac-btn-secondary" onClick={() => { setMethod(method === "card" ? "sbp" : "card"); setStatus("select"); setAuto(true); }}>Другой способ</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
