export const LANDING_VIDEO_SRC = process.env.NEXT_PUBLIC_LANDING_VIDEO_SRC?.trim() ?? "";
export const LANDING_POSTER_SRC =
  process.env.NEXT_PUBLIC_LANDING_POSTER_SRC?.trim() || "/landing/demo-poster.jpg";
export const LANDING_DEMO_POSTER_ALT =
  "Иллюстративный демо-кадр с макета: человек говорит в микрофон. Это не портрет основателя Vocal.";

export const landingCopy = {
  title: "Vocal — мысль до ролика",
  description:
    "Раскройте мысль в диалоге, подготовьте основу ролика и получите обратную связь по записи.",
  h1: "Мысль уже есть. Давайте найдём для неё слова.",
  h1Accent: "для неё слова.",
  mobileLead:
    "Vocal поможет раскрыть мысль в диалоге, собрать основу ролика и понять, что улучшить в записи.",
  desktopLead: "Раскройте мысль в диалоге, подготовьте основу ролика и получите обратную связь по записи.",
  cta: "Подготовить первый ролик",
  ctaHint: "Начните с мысли — текстом или голосом",
  polaroidCaption: "От моей мысли до записи",
  login: "Войти",
  toThoughts: "К мыслям",
  conversationKicker: "Пример диалога",
  conversationMobileTitle: "Начните с разговора",
  conversationDesktopTitle: "От общей идеи — к вашей истории",
  conversationDesktopLead:
    "Vocal задаёт вопросы, чтобы найти конкретный случай и главное, что вы хотите сказать",
  stages: ["Мысль", "Уточнение", "Основа ролика"] as const,
  resultKicker: "Ваш результат",
  resultTitle: "В основе — ваш опыт",
  resultLead: "Соберите понятное начало, основную мысль и завершение. Сохраните свои слова и интонацию",
  resultCardTitle: "Начало ролика",
  resultCardBody: "Я купил третий курс по съёмке. Но так и не записал ни одного ролика",
  resultMarker: "Иллюстративный пример",
  feedbackKicker: "Обратная связь",
  feedbackTitle: "Записали дубль? Найдите следующий шаг",
  feedbackLead: "Посмотрите, что получилось и что стоит уточнить перед новой записью",
  feedbackCardTitle: "Пример обратной связи",
  feedbackKeepTitle: "Что получилось",
  feedbackKeep: "Личный случай сразу раскрывает тему",
  feedbackTryTitle: "Что попробовать",
  feedbackTry: "Поясните, почему снова выбрали обучение вместо записи",
  faqKicker: "Вопросы",
  faqTitle: "Перед первой записью",
  faqLead: "Короткие ответы на частые вопросы.",
  finalTitle: "Начните с того, что хочется сказать",
  videoPending: "Видео готовится",
  videoPendingHint: "Настоящий ролик автора ещё не добавлен. Это предварительный просмотр.",
  videoError: "Не удалось загрузить видео.",
  videoRetry: "Повторить",
} as const;

export const landingBenefits = [
  {
    id: "dialogue",
    mobileTitle: "Диалог с ИИ для ясных мыслей",
    desktopTitle: "Проясните мысль",
    text: "Вопросы, которые помогают раскрыть мысль",
    desktopText: "Vocal задаёт вопросы, которые помогают увидеть главное.",
  },
  {
    id: "style",
    mobileTitle: "Сценарий под ваш стиль",
    desktopTitle: "Сохраните свой стиль",
    text: "Сохраните свои слова и интонацию",
    desktopText: "Структура подстраивается под ваш опыт и язык.",
  },
  {
    id: "feedback",
    mobileTitle: "Запись и обратная связь",
    desktopTitle: "Поймите, что улучшить",
    text: "Понятные рекомендации для следующего дубля",
    desktopText: "Получите понятные рекомендации после записи.",
  },
] as const;

export const landingConversation = [
  { role: "user" as const, text: "Хочу снимать, но всё время откладываю." },
  { role: "agent" as const, text: "Что останавливает перед записью?" },
  { role: "user" as const, text: "Кажется, что сначала нужно ещё поучиться." },
  { role: "agent" as const, text: "Был случай, когда вы выбрали обучение вместо записи?" },
  { role: "user" as const, text: "Купил третий курс по съёмке, хотя ещё не записал ни одного ролика." },
  { role: "agent" as const, text: "Попробуйте начать с этого случая. Что вы тогда поняли?" },
];

export const landingFaq = [
  {
    id: "script",
    question: "Можно начать без сценария?",
    answer:
      "Да. Сначала появляется мысль — текстом, голосом или видео. Сценарий собирается позже из вашего материала, его можно править и сохранять версиями.",
    approved: true,
  },
  {
    id: "video",
    question: "Обязательно сразу записывать видео?",
    answer:
      "Нет. Можно начать с текста или голоса. Видео — отдельный дубль, когда вы к нему готовы. Камера внутри Vocal не нужна: готовый файл загружается с устройства.",
    approved: true,
  },
  {
    id: "data",
    question: "Как обрабатываются мои записи?",
    answer:
      "Утверждённый публичный текст о политике данных ещё не готов. В приложении записи принадлежат вашему аккаунту и не показываются другим пользователям. Этот ответ не публиковать как окончательный.",
    approved: false,
  },
] as const;

export const landingDesktopNav = [
  { href: "#benefits", label: "Как работает" },
  { href: "#dialog", label: "Пример диалога" },
  { href: "#faq", label: "Вопросы" },
] as const;
