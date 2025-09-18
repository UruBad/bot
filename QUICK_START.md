# 🚀 Быстрый запуск бота

## 1. Установка зависимостей
```bash
npm install
```

## 2. Настройка
1. Создайте бота через [@BotFather](https://t.me/BotFather)
2. Скопируйте `env.example` в `.env`
3. Заполните `.env`:
```
BOT_TOKEN=ваш_токен_от_botfather
ADMIN_ID=ваш_telegram_id
```

## 3. Запуск
```bash
npm start
```

## 4. Использование
- Пользователи: `/start` → `/matches` → "Сделать прогноз"
- Админ: `/addmatch` → `/finishmatch ID X:Y`
- Сезоны: `/newseason` для нового сезона

---
**Готово!** 🎯 Бот работает с системой баллов 3-2-1 и сезонами!
