# mirea-table-bot
Telegram Bot for MIREA's Schedule


### Как работает

Работает на Node.js
Необходимые модули:
* Telegraf
* node-fetch
* node-xlsx
* node-cron

Всего два файла: `.js` и конфиг. В конфиге задаётся:
* ссылка страницы с расписанием (НЕ САМ .XLSX ФАЙЛ!)
* unix-timestamp начала семестра (в мс)
* название факультета
* номер группы
* пользователи
* админ
* токен бота
