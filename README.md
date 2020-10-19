# mirea-table-bot
Telegram Bot for MIREA's Schedule


### Как работает

Работает на Node.js<br>
Необходимые модули:
* Telegraf
* node-fetch
* node-xlsx
* node-cron

Всего четыре файла: `.js`, конфиг, пользователи и исправления опечаток.
<br>
В конфиге задаётся:
* ссылка страницы с расписанием (__не сам `.xlsx`-файл__)
* unix-timestamp начала семестра (в мс)
* название факультета
* номер группы
* админ
* токен бота
<br>
В файле пользователей – массив объектов-пользователей с id (не username) и username – который необязательно username от Telegram, а __любой удобный для вас никнейм/алиас__. Список пользователей и файл с ними автоматически пополняется по команде /start от нового пользователя. Удалять надо вручную: тут ничего не поделаешь, Telegram такой.
<br>
В файле `fixes.json` – исправления опечаток.
