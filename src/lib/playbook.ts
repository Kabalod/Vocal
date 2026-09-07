export const VIDEO_FORMATS = [
  "advice",
  "story",
  "vlog",
  "street",
  "micro",
  "performance",
] as const;

export type VideoFormatId = (typeof VIDEO_FORMATS)[number];

export const CONVERSATIONAL_GROWTH_PLAYBOOK = {
  name: "Conversational blog growth playbook",
  version: "1.0",
  source:
    "Паттерны разговорных блогов, которые выросли за счёт живой речи (эмпирика: корпус SirDenisov + устойчивые приёмы talking-head авторов с большой аудиторией). Не экспертные карусели и не «подпишись» как смысл ролика.",
  patterns: [
    {
      id: "scene_first_hook",
      title: "Сцена в первой фразе",
      do: "Начинать с конкретного момента («Я сегодня почувствовал себя девчонкой», «Сделай это до конца года»), а не с представления и темы.",
      dont: "«Всем привет, меня зовут… сегодня поговорим о…».",
    },
    {
      id: "one_idea",
      title: "Одна мысль на ролик",
      do: "Одна формулировка, которую можно повторить в финале. Остальное — только чтобы её доказать жизнью.",
      dont: "Три совета, обзор жизни и призыв подписаться в одном ролике.",
    },
    {
      id: "lived_proof",
      title: "Случай вместо лекции",
      do: "Имена, место, деталь, затем вывод. История и есть аргумент.",
      dont: "«Во-первых / исследования показывают» без тела сцены.",
    },
    {
      id: "delayed_thesis",
      title: "Тезис может подождать 20–40 секунд",
      do: "Открытый вопрос или сцена, потом «и тут надо сказать». Это хук, не путаница.",
      dont: "Требовать «сегодня я расскажу» в первой фразе.",
    },
    {
      id: "setup_is_not_water",
      title: "Setup сцены — не вода",
      do: "Резать только то, что не кормит финальную мысль: дисклеймеры, самопрезентацию, повтор морали.",
      dont: "Срезать предысторию, если без неё punchline не работает.",
    },
    {
      id: "soft_landing",
      title: "Мягкий финал сильнее подписки",
      do: "Пожелание, образ, вопрос в комментарии, «чао». Зритель уходит с мыслью.",
      dont: "Обязательный «подпишись / сохрани». У выросших разговорных блогов это редко смысл ролика.",
    },
    {
      id: "address_as_people",
      title: "Обращение как к людям",
      do: "«ты», «вы», «ребята» можно мешать. Главное — зритель узнаёт себя в ситуации.",
      dont: "Штрафовать смесь регистров или отсутствие нишевого «если ты SMM».",
    },
    {
      id: "specific_over_generic",
      title: "Конкретика вместо «важно развиваться»",
      do: "Корт, завтрак, письмо, которое сожжёшь, варан 20 км/ч.",
      dont: "Абстрактная мотивация без якоря в дне автора.",
    },
    {
      id: "weak_scenario",
      title: "Слабый сценарий",
      do: "Показать, какой кусок переписать: нет тела, нет посадки мысли, хук обещает не то, что выдаёт середина.",
      dont: "Монтировать или вырезать исходник. Только текст: что сказать иначе в следующем дубле.",
    },
    {
      id: "voice_over_polish",
      title: "Живая речь важнее гладкости",
      do: "Оставлять «ну/вот», если они клеят мысль. Править канцелярит и тройной повтор морали.",
      dont: "Требовать сценическую дикцию и «харизму» без конкретной замены фразы.",
    },
    {
      id: "im_here_im_yours",
      title: "Я тут, я свой",
      do: "Говорить как человек рядом, не как эксперт с кафедры. Присутствие важнее статуса.",
      dont: "Штрафовать «я» и личный центр. Это не эго — это доверие.",
    },
    {
      id: "invite_to_live",
      title: "Мотивирует делать так же",
      do: "После ролика хочется снять / попробовать / жить живее, а не «сохранить карусель».",
      dont: "Требовать «подпишись» как смысл. Приглашение в живой блог сильнее CTA.",
    },
    {
      id: "anti_plastic",
      title: "Не пластик",
      do: "Неровность, тепло, конкретный день. Помогает другим уйти от гладкого контента.",
      dont: "Награждать отполированный шаблон «польза + структура + призыв».",
    },
  ],
} as const;

export const MICRO_CRITERION_IDS = new Set([
  "hook_strength",
  "topic_clarity",
  "reason_to_continue",
  "intro_efficiency",
  "main_idea",
  "story_payoff",
  "conversational",
  "unique_voice",
  "focus",
]);

export const STORY_OPTIONAL_IDS = new Set(["argumentation", "next_action"]);

export function normalizeFormat(raw: string, wordCount: number): VideoFormatId {
  const value = raw.trim().toLowerCase();
  if (wordCount > 0 && wordCount < 80) return "micro";
  if ((VIDEO_FORMATS as readonly string[]).includes(value)) {
    return value as VideoFormatId;
  }
  if (value.includes("истор") || value.includes("story")) return "story";
  if (value.includes("vlog") || value.includes("влог")) return "vlog";
  if (value.includes("улиц") || value.includes("диалог")) return "street";
  if (value.includes("песн") || value.includes("performance")) return "performance";
  if (value.includes("совет") || value.includes("как ")) return "advice";
  return "story";
}
