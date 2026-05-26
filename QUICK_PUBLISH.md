# 🚀 Быстрая публикация на GitHub

## Шаг 1: Создайте репозиторий на GitHub.com

1. Откройте в браузере: https://github.com/new
2. Заполните:
   - **Repository name**: `syncwatch`
   - **Description**: `Real-time video watch party app with WebSocket sync`
   - **Public** или **Private** (на ваш выбор)
   - ❌ НЕ добавляйте README, .gitignore, license
3. Нажмите **"Create repository"**

## Шаг 2: Скопируйте URL репозитория

После создания GitHub покажет URL вида:
```
https://github.com/ВАШ_USERNAME/syncwatch.git
```

## Шаг 3: Выполните команды в терминале

Откройте терминал в VS Code (Ctrl+`) и выполните:

```bash
# Добавьте удалённый репозиторий (замените YOUR_USERNAME на ваш GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/syncwatch.git

# Переименуйте ветку в main
git branch -M main

# Отправьте код на GitHub
git push -u origin main
```

### Пример для пользователя "ivan":
```bash
git remote add origin https://github.com/ivan/syncwatch.git
git branch -M main
git push -u origin main
```

## Готово! 🎉

Ваш проект теперь на GitHub!

---

## Что дальше?

### 🌐 Деплой на Render (бесплатный хостинг)

1. Перейдите на https://render.com
2. Войдите через GitHub
3. Нажмите **"New +"** → **"Web Service"**
4. Выберите репозиторий **syncwatch**
5. Render автоматически обнаружит настройки из `render.yaml`
6. Добавьте переменную окружения:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: ваш API ключ от Google Gemini
7. Нажмите **"Create Web Service"**

Через 2-3 минуты ваше приложение будет доступно онлайн! 🚀

### 📱 Получите API ключ Gemini (если нет)

1. Перейдите на https://ai.google.dev/
2. Нажмите **"Get API key"**
3. Создайте новый ключ
4. Скопируйте и используйте в Render

---

## 🔄 Обновление кода в будущем

После изменений в коде:

```bash
git add .
git commit -m "Описание изменений"
git push
```

Render автоматически задеплоит новую версию!
