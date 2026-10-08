"""Share of Vocal replies with style words, from a dialogues markdown written by r5.ts --md. Usage: style_metrics.py <file.md>.
Counts replies of kind question/text. Server-made fixed strings (return phrase, proposal sentence, neutral questions) are
listed separately: they are our own text, not the model's, and are excluded from the model-reply share."""
import re, sys
PATTERNS = {
    "по вашему мнению": r"по вашему мнению",
    "по-вашему": r"по[- ]вашему(?! мнению)",
    "пожалуйста": r"пожалуйста",
    "конкретн*": r"конкретн\w*",
    "вывод/урок/позиция/тезис": r"вывод\w*|урок\w*|позици\w*|тезис\w*",
}
RETURN = "Это в сторону от нашей мысли, давайте вернёмся к ней."
SERVER = {
    "Для следующего дубля у вас уже есть опора. Запишите его или соберите сценарий.",
    "О каком одном конкретном случае вы сейчас думаете?", "Какую одну мысль вы хотите, чтобы зритель унёс?",
    "Что в этом случае было видно со стороны, а что вы к нему добавляете сами?", "Почему, по-вашему, так получается?",
    "Чем для вас отличаются эти два понятия, когда вы видите их в жизни?", "Был ли похожий случай ещё раз?",
    "В какой ситуации это не сработает?", "Кому вы это говорите в кадре?", "Какую одну тему из названных вы хотите сказать сейчас?",
    "Что зритель поймёт после этого ролика?", "Что для вас здесь главное своими словами?", "Какой один конкретный случай вы бы рассказали?",
    "Хотите продолжить с этой мыслью или записать следующий дубль?",
}
text = open(sys.argv[1], encoding="utf-8").read()
replies = re.findall(r"\*\*Vocal\*\* \((?:question|text)\): (.*)", text)
errors = text.count("[ошибка хода]")
model, server = [], []
for r in replies:
    core = r[len(RETURN):].strip() if r.startswith(RETURN) else r
    (server if core in SERVER else model).append(r)
print(f"file={sys.argv[1]}  replies={len(replies)}  model={len(model)}  server_fixed={len(server)}  error_turns={errors}")
union_model = sum(1 for r in model if any(re.search(p, r, re.I) for p in PATTERNS.values()))
for name, p in PATTERNS.items():
    n = sum(1 for r in model if re.search(p, r, re.I))
    print(f"  {name:28} {n:3} / {len(model)} = {100*n/max(1,len(model)):.0f}%")
print(f"  {'любое из слов':28} {union_model:3} / {len(model)} = {100*union_model/max(1,len(model)):.0f}%")
