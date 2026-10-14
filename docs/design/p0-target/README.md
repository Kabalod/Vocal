# P0 «цель»: прототип vocalv0 (скриншоты)

Сняты 14.10.2026 с прототипа `Kabalod/vocalv0`, ветка `main`, коммит `e27caf46f5f09f76eb887b8113473740867b01b1` (копия отслеживаемых файлов `git archive`, `next dev`; сама папка `~/vocal-v0` не менялась).

- Окна: `1440x900` и `390x844`, Chromium headless. Префикс файла = размер окна.
- Оговорки: (1) шрифты Inter и Literata в прототипе только названы в CSS и не подключены (нет `next/font`/`@font-face`), поэтому на снимках системная замена (DejaVu); в продукте шрифты загружает `next/font`, вид текста после переноса будет другим. (2) В левом нижнем углу виден индикатор `next dev` — он не часть дизайна. (3) Данные моковые: 1 248 мыслей, «Артём Лесной», ресурс 72%.
- Состояния вызваны параметрами прототипа: `?takes=0`, `?sub=none|expired`, `?pay=processing|success|failed`, `?states`, `?quota`, `?res=8`.

| Файл (после префикса) | Экран |
|---|---|
| `01-reels-library-desk` (+`01b-library-grid`, `01c-library-list` только 1440) | библиотека: стол / сетка / список |
| `01d-library-calendar` | календарь (на 390 — лист «Дата») |
| `01e-library-search` | поиск «мотив» |
| `01f-command-palette` | командная палитра ⌘K (только 1440) |
| `02-new-thought` | новая мысль |
| `03-thought-default-dialog` | экран мысли, вкладка «Диалог» |
| `04-thought-takes`, `04b-takes-empty` | путь дублей / пусто |
| `06-thought-script`, `06b-thought-menu`, `06c-script-building`, `06d-script-built` | сценарий, меню мысли, сборка, собрано |
| `07-delete-confirm` | подтверждение удаления |
| `08-take-recorder` | запись дубля |
| `09-profile`, `09-profile-sub-none`, `09-profile-sub-expired` | профиль: активная / нет / истекла подписка |
| `10-payment-select`, `-processing`, `-success`, `-failed` | оплата |
| `11-states-gallery` | галерея состояний |
| `12-quota-library`, `12b-resource-low` | ресурс закончился / мало |

В прототипе нет: входа, регистрации, лендинга, настроек, `/dev/ui`.
