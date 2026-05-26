# 📦 Как добавить проект в GitHub

## Способ 1: Через VS Code (Рекомендуется - САМЫЙ ПРОСТОЙ)

1. **Откройте панель Source Control** (Ctrl+Shift+G)
2. **Нажмите "Publish to GitHub"**
3. **Выберите**:
   - Название: `syncwatch`
   - Описание: `Real-time video watch party app with chat and sync`
   - Public или Private
4. **Нажмите "Publish repository"**

✅ Готово! VS Code всё сделает автоматически.

---

## Способ 2: Через командную строку

### Шаг 1: Создайте репозиторий на GitHub.com

1. Перейдите на https://github.com/new
2. Название: `syncwatch`
3. Описание: `Real-time video watch party app with chat and sync`
4. Выберите Public или Private
5. **НЕ** добавляйте README, .gitignore или license (у вас уже есть)
6. Нажмите "Create repository"

### Шаг 2: Подключите локальный репозиторий

GitHub покажет вам команды. Используйте эти:

```bash
# Добавьте удалённый репозиторий (замените YOUR_USERNAME на ваш GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/syncwatch.git

# Переименуйте ветку в main (если нужно)
git branch -M main

# Запушьте код
git push -u origin main
```

### Пример для конкретного пользователя:

Если ваш GitHub username: `ivan123`, то команды будут:

```bash
git remote add origin https://github.com/ivan123/syncwatch.git
git branch -M main
git push -u origin main
```

---

## Способ 3: Через GitHub CLI (если установлен)

```bash
# Создать репозиторий и запушить одной командой
gh repo create syncwatch --public --source=. --remote=origin --push

# Или для приватного:
gh repo create syncwatch --private --source=. --remote=origin --push
```

---

## После публикации

Ваш репозиторий будет доступен по адресу:
```
https://github.com/YOUR_USERNAME/syncwatch
```

### Обновление кода в будущем:

```bash
# Добавить изменения
git add .

# Создать коммит
git commit -m "Описание изменений"

# Отправить на GitHub
git push
```

---

## 🚀 Деплой на Render после публикации

1. Перейдите на https://render.com
2. Нажмите "New +" → "Web Service"
3. Подключите ваш GitHub репозиторий `syncwatch`
4. Render автоматически обнаружит настройки из `render.yaml`
5. Добавьте переменную окружения `GEMINI_API_KEY`
6. Нажмите "Create Web Service"

Готово! Ваше приложение будет доступно онлайн.

---

## 📝 Полезные команды Git

```bash
# Проверить статус
git status

# Посмотреть историю коммитов
git log --oneline

# Посмотреть удалённые репозитории
git remote -v

# Создать новую ветку
git checkout -b feature-name

# Переключиться на ветку
git checkout main
```
