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

### Интеграция с GitHub

Репозиторий на GitHub: `petr-tartyshev/office-tours`.

#### Первый пуш (настроить один раз локально)

```bash
cd /Users/petr/excursions/excursion
git remote add origin https://github.com/petr-tartyshev/office-tours.git
git branch -M main
git push -u origin main
```

#### Типичный цикл обновления бота

1. Вносишь изменения в код.
2. Фиксируешь их:

```bash
git add .
git commit -m "описание изменений"
git push
```

3. На машине, где запущен бот, обновляешь код:

```bash
cd /Users/petr/excursions/excursion
git pull origin main
npm install    # на случай новых зависимостей
```

4. Перезапускаешь бота (если он запущен через `npm run dev`, достаточно остановить процесс и снова выполнить `npm run dev`).

