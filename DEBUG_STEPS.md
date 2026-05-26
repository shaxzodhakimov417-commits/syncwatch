# 🔍 Диагностика проблемы с созданием комнат

## Шаг 1: Проверьте консоль браузера

1. Откройте ваше приложение: https://syncwatch-gules.vercel.app
2. Нажмите **F12** (или правой кнопкой → Inspect)
3. Перейдите на вкладку **Console**
4. Попробуйте создать комнату
5. Посмотрите на ошибки (красный текст)

**Возможные ошибки:**
- `WebSocket connection failed`
- `Failed to connect to backend`
- `CORS error`
- `404 Not Found`

## Шаг 2: Проверьте Network

1. В DevTools перейдите на вкладку **Network**
2. Попробуйте создать комнату
3. Посмотрите на запросы к backend
4. Проверьте, есть ли красные (failed) запросы

## Шаг 3: Проверьте переменную окружения

Откройте консоль браузера и введите:
```javascript
console.log(import.meta.env.VITE_BACKEND_URL)
```

Должно вывести: `https://syncwatch-dqhw.onrender.com`

Если выводит `undefined` или `http://localhost:3000` - переменная не применилась.

## Шаг 4: Проверьте backend на Render

1. Откройте: https://dashboard.render.com
2. Найдите сервис **syncwatch**
3. Проверьте статус - должен быть **Live** (зелёный)
4. Посмотрите логи - должно быть "Server running on http://localhost:3000"

## Возможные проблемы и решения:

### Проблема 1: Backend "спит" (Render free tier)
**Симптом**: Долгая загрузка, таймаут
**Решение**: Подождите 30-60 секунд при первом запросе (Render "будит" сервер)

### Проблема 2: CORS ошибка
**Симптом**: "CORS policy blocked"
**Решение**: Backend уже настроен на `origin: "*"`, но проверьте логи Render

### Проблема 3: Переменная окружения не применилась
**Симптом**: Подключается к localhost
**Решение**: 
1. Vercel → Settings → Environment Variables
2. Убедитесь что `VITE_BACKEND_URL` = `https://syncwatch-dqhw.onrender.com`
3. Redeploy проект

### Проблема 4: WebSocket не подключается
**Симптом**: "WebSocket connection failed"
**Решение**: Render поддерживает WebSocket, но проверьте:
- Backend запущен (статус Live)
- URL правильный (без лишних слешей в конце)

## Быстрая проверка:

Откройте в браузере:
```
https://syncwatch-dqhw.onrender.com
```

Должна открыться страница приложения (фронтенд от backend).
Если 404 или ошибка - backend не работает правильно.
