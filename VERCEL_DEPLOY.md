# 🚀 Деплой на Vercel + Render

Ваше приложение использует WebSocket, поэтому мы разделим его на две части:
- **Фронтенд (React)** → Vercel
- **Backend (WebSocket сервер)** → Render

---

## Часть 1: Деплой Backend на Render (5 минут)

### Шаг 1: Зарегистрируйтесь на Render
1. Перейдите на https://render.com
2. Нажмите **"Get Started"**
3. Войдите через **GitHub**

### Шаг 2: Создайте Web Service
1. Нажмите **"New +"** → **"Web Service"**
2. Подключите репозиторий **syncwatch**
3. Render автоматически обнаружит `render.yaml`
4. Нажмите **"Create Web Service"**

### Шаг 3: Добавьте переменную окружения
В настройках сервиса:
- **Key**: `GEMINI_API_KEY`
- **Value**: ваш API ключ от Google Gemini (https://ai.google.dev/)

### Шаг 4: Скопируйте URL
После деплоя скопируйте URL вашего backend (например: `https://syncwatch-abc123.onrender.com`)

---

## Часть 2: Деплой Frontend на Vercel (3 минуты)

### Шаг 1: Зарегистрируйтесь на Vercel
1. Перейдите на https://vercel.com
2. Нажмите **"Sign Up"**
3. Войдите через **GitHub**

### Шаг 2: Импортируйте проект
1. Нажмите **"Add New..."** → **"Project"**
2. Выберите репозиторий **syncwatch**
3. Нажмите **"Import"**

### Шаг 3: Настройте проект
В настройках проекта:

**Build & Development Settings:**
- Framework Preset: **Vite**
- Build Command: `npm run build:vercel`
- Output Directory: `dist`
- Install Command: `npm install`

**Environment Variables:**
Добавьте переменную:
- **Name**: `VITE_BACKEND_URL`
- **Value**: URL вашего backend с Render (например: `https://syncwatch-abc123.onrender.com`)

### Шаг 4: Деплой
1. Нажмите **"Deploy"**
2. Подождите 2-3 минуты
3. Готово! Ваше приложение онлайн! 🎉

---

## 🔧 Альтернатива: Только Vercel (с ограничениями)

Если хотите всё на Vercel (не рекомендую для WebSocket):

1. Установите Vercel CLI:
```bash
npm install -g vercel
```

2. Деплой:
```bash
vercel
```

3. Следуйте инструкциям в терминале

**Ограничения:**
- WebSocket может работать нестабильно
- Таймаут 10 секунд для бесплатного плана
- Нет постоянного соединения

---

## 📝 Обновление кода

После изменений:

```bash
git add .
git commit -m "Описание изменений"
git push
```

Vercel и Render автоматически задеплоят новые версии!

---

## 🆘 Troubleshooting

### WebSocket не подключается
- Проверьте, что `VITE_BACKEND_URL` правильно настроен в Vercel
- Убедитесь, что backend на Render запущен
- Проверьте CORS настройки в `server.ts`

### Backend не запускается на Render
- Проверьте, что `GEMINI_API_KEY` добавлен
- Посмотрите логи в Render Dashboard

---

## 🎯 Рекомендация

**Используйте Vercel + Render** - это самый надёжный способ для вашего приложения с WebSocket!
