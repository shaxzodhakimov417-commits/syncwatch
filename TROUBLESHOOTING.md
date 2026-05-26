# 🔧 Устранение проблем с синхронизацией

## Проблема: Не могу создать комнату / Синхронизация не работает

### Шаг 1: Проверьте консоль браузера

1. Откройте приложение: https://syncwatch-gules.vercel.app
2. Нажмите **F12** (DevTools)
3. Перейдите на вкладку **Console**
4. Попробуйте создать комнату
5. Посмотрите на сообщения:

**Что должно быть:**
```
🔌 Connecting to backend: https://syncwatch-dqhw.onrender.com
✅ Socket connected! ID: abc123xyz
📡 Emitting join-room event for room: party-abc123
📥 Received room-status: {id: "party-abc123", ...}
```

**Если видите:**
```
❌ Socket connection error: ...
```
Значит проблема с подключением к backend.

### Шаг 2: Проверьте backend на Render

1. Откройте в браузере: https://syncwatch-dqhw.onrender.com
2. Должна загрузиться страница приложения
3. Если видите ошибку или долго грузится - backend "спит"

**Решение для "спящего" backend:**
- Подождите 30-60 секунд (Render бесплатный план "будит" сервер)
- Обновите страницу
- Попробуйте создать комнату снова

### Шаг 3: Проверьте переменную окружения

В консоли браузера введите:
```javascript
console.log(import.meta.env.VITE_BACKEND_URL)
```

**Должно вывести:**
```
https://syncwatch-dqhw.onrender.com
```

**Если выводит `undefined` или `http://localhost:3000`:**

1. Перейдите в Vercel: https://vercel.com/shaxs-projects-405b79b9/syncwatch/settings/environment-variables
2. Проверьте что `VITE_BACKEND_URL` = `https://syncwatch-dqhw.onrender.com`
3. Если нет - добавьте/исправьте
4. Redeploy проект

### Шаг 4: Используйте debug страницу

Откройте: https://syncwatch-gules.vercel.app/src/debug.html

Эта страница автоматически проверит:
- ✅ Backend доступен
- ✅ WebSocket подключается
- ✅ События room-status приходят

### Шаг 5: Проверьте CORS

Если видите ошибку:
```
Access to XMLHttpRequest blocked by CORS policy
```

**Решение:**
Backend уже настроен на `cors: { origin: "*" }`, но проверьте:
1. Откройте Render Dashboard
2. Перейдите в логи сервиса syncwatch
3. Убедитесь что нет ошибок CORS

---

## Частые проблемы:

### 1. Backend "спит" (Render Free Tier)
**Симптом:** Долгая загрузка, таймаут при первом запросе
**Решение:** Подождите 30-60 секунд, backend автоматически "проснётся"

### 2. Переменная окружения не применилась
**Симптом:** Подключается к localhost вместо Render
**Решение:** 
- Vercel → Settings → Environment Variables
- Добавьте `VITE_BACKEND_URL` = `https://syncwatch-dqhw.onrender.com`
- Redeploy

### 3. WebSocket не подключается
**Симптом:** "WebSocket connection failed"
**Решение:**
- Проверьте что backend запущен (статус Live в Render)
- Проверьте URL (без слеша в конце)
- Подождите если backend "спит"

### 4. Комната создаётся, но не синхронизируется
**Симптом:** Видео не синхронизируется между пользователями
**Решение:**
- Проверьте что оба пользователя подключены к одной комнате
- Проверьте консоль на ошибки
- Убедитесь что один пользователь - лидер (корона рядом с именем)

---

## Быстрая проверка всей системы:

### 1. Backend работает?
```
curl https://syncwatch-dqhw.onrender.com
```
Должен вернуть HTML страницу

### 2. WebSocket работает?
Откройте debug страницу и нажмите "Test WebSocket"

### 3. Vercel деплой актуальный?
Проверьте что последний деплой включает переменную `VITE_BACKEND_URL`

---

## Если ничего не помогло:

1. **Перезапустите backend на Render:**
   - Dashboard → syncwatch → Manual Deploy → Deploy Latest Commit

2. **Пересоздайте деплой на Vercel:**
   - Vercel → Deployments → Redeploy

3. **Проверьте логи:**
   - Render: Dashboard → syncwatch → Logs
   - Vercel: Dashboard → Deployments → [последний] → Function Logs

4. **Локальный тест:**
   ```bash
   npm run dev
   ```
   Откройте http://localhost:3000 и проверьте работает ли локально

---

## Контакты для помощи:

- GitHub Issues: https://github.com/shaxzodhakimov417-commits/syncwatch/issues
- Backend URL: https://syncwatch-dqhw.onrender.com
- Frontend URL: https://syncwatch-gules.vercel.app
