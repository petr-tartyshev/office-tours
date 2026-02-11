## Excursion — Telegram бот для записи на экскурсии в офис Авито

Отдельный проект Telegram-бота.

### Требования

- Node.js 18+
- npm

### Быстрый старт

1. Перейти в папку проекта:

```bash
cd /Users/petr/excursions/excursion
```

2. Установить зависимости:

```bash
npm install
```

3. Создать файл `.env` и прописать токен:

```bash
echo "TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here" > .env
```

4. Запустить бота в режиме разработки:

```bash
npm run dev
```

### Скрипты

- `npm run dev` — запуск бота через `ts-node`
- `npm run build` — компиляция TypeScript в `dist`
- `npm start` — запуск собранной версии из `dist`
