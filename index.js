require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database');
const ScoringSystem = require('./scoring');
const moment = require('moment');
const http = require('http');
const url = require('url');

// Настройка локали для момента
moment.locale('ru');

class PredictionBot {
    constructor() {
        this.token = process.env.BOT_TOKEN;
        
        // Обработка списка администраторов
        const adminIds = process.env.ADMIN_IDS;
        if (adminIds) {
            this.adminIds = adminIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        } else {
            this.adminIds = [];
        }

        // Главный администратор
        const superAdminId = process.env.SUPER_ADMIN_ID;
        this.superAdminId = superAdminId ? parseInt(superAdminId) : (this.adminIds[0] || null);
        
        if (!this.token) {
            throw new Error('BOT_TOKEN не найден в переменных окружения');
        }

        if (this.adminIds.length === 0) {
            console.warn('⚠️ ADMIN_IDS не настроены. Бот будет работать без администраторов!');
        }

        this.bot = new TelegramBot(this.token, { polling: true });
        this.db = new Database();
        
        // Состояния для создания матчей
        this.userStates = new Map();
        
        // Настройка HTTP сервера
        this.port = process.env.PORT || 3000;
        this.initializeHttpServer();
        
        this.initializeAdmins();
        this.setupHandlers();
        this.startMatchNotificationChecker();
        console.log('🤖 Бот запущен и готов к работе!');
        console.log(`👥 Настроено администраторов: ${this.adminIds.length}`);
        if (this.superAdminId) {
            console.log(`🔑 Главный администратор: ${this.superAdminId}`);
        }
    }

    initializeHttpServer() {
        this.server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const pathname = parsedUrl.pathname;

            // Настройка CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            // Обработка маршрутов
            if (pathname === '/') {
                this.handleRootRoute(res);
            } else if (pathname === '/status') {
                this.handleStatusRoute(res);
            } else if (pathname === '/health') {
                this.handleHealthRoute(res);
            } else if (pathname === '/stats') {
                this.handleStatsRoute(res);
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Маршрут не найден' }));
            }
        });

        this.server.listen(this.port, () => {
            console.log(`🌐 HTTP сервер запущен на порту ${this.port}`);
            console.log(`📊 Статус бота: http://localhost:${this.port}/status`);
        });

        this.server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ Порт ${this.port} уже используется. Попробуйте другой порт.`);
                process.exit(1);
            } else {
                console.error('❌ Ошибка HTTP сервера:', error);
            }
        });
    }

    handleRootRoute(res) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Бот прогнозов футбола</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 50px; background: #f5f5f5; }
                .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #2c3e50; }
                .status { padding: 10px; background: #27ae60; color: white; border-radius: 5px; }
                .links { margin-top: 20px; }
                .links a { display: inline-block; margin: 5px 10px 5px 0; padding: 10px 15px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
                .links a:hover { background: #2980b9; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Бот прогнозов футбола</h1>
                <div class="status">✅ Бот работает нормально</div>
                <div class="links">
                    <a href="/status">📊 Статус JSON</a>
                    <a href="/health">🏥 Проверка здоровья</a>
                    <a href="/stats">📈 Статистика</a>
                </div>
                <p>Сервер запущен на порту ${this.port}</p>
            </div>
        </body>
        </html>`;
        res.end(html);
    }

    async handleStatusRoute(res) {
        try {
            const currentSeason = await this.db.getCurrentSeason();
            const usersCount = await this.db.getUsersCount();
            const activeMatches = await this.db.getActiveMatches();
            
            const status = {
                bot: {
                    status: 'running',
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    port: this.port
                },
                telegram: {
                    admins_count: this.adminIds.length,
                    super_admin: this.superAdminId
                },
                database: {
                    users_count: usersCount || 0,
                    active_matches: activeMatches.length,
                    current_season: currentSeason ? currentSeason.name : 'Нет активного сезона'
                },
                timestamp: new Date().toISOString()
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status, null, 2));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ошибка получения статуса', details: error.message }));
        }
    }

    handleHealthRoute(res) {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
    }

    async handleStatsRoute(res) {
        try {
            const leaders = await this.db.getLeaderboard(10);
            const currentSeason = await this.db.getCurrentSeason();
            const totalMatches = await this.db.getTotalMatchesCount();
            const totalPredictions = await this.db.getTotalPredictionsCount();

            const stats = {
                season: currentSeason ? {
                    name: currentSeason.name,
                    number: currentSeason.season_number,
                    start_date: currentSeason.start_date
                } : null,
                leaderboard: leaders.map((user, index) => ({
                    position: index + 1,
                    name: user.first_name || user.username || 'Аноним',
                    points: user.total_points
                })),
                totals: {
                    matches: totalMatches || 0,
                    predictions: totalPredictions || 0,
                    users: leaders.length
                },
                timestamp: new Date().toISOString()
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(stats, null, 2));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ошибка получения статистики', details: error.message }));
        }
    }

    async initializeAdmins() {
        // Инициализируем администраторов из переменных окружения в базе данных
        try {
            for (const adminId of this.adminIds) {
                const isSuperAdmin = adminId === this.superAdminId;
                await this.db.addAdmin(adminId, null, null, null, isSuperAdmin, null);
            }
        } catch (error) {
            console.error('Ошибка при инициализации администраторов:', error);
        }
    }

    async isAdmin(userId) {
        // Проверяем и в переменных окружения, и в базе данных
        if (this.adminIds.includes(userId)) {
            return true;
        }
        
        try {
            return await this.db.isAdmin(userId);
        } catch (error) {
            console.error('Ошибка при проверке прав администратора:', error);
            return false;
        }
    }

    async isSuperAdmin(userId) {
        // Проверяем главного администратора
        if (userId === this.superAdminId) {
            return true;
        }
        
        try {
            return await this.db.isSuperAdmin(userId);
        } catch (error) {
            console.error('Ошибка при проверке прав супер-администратора:', error);
            return false;
        }
    }

    setupHandlers() {
        // Обработка команд
        this.bot.onText(/\/start/, this.handleStart.bind(this));
        this.bot.onText(/\/help/, this.handleHelp.bind(this));
        this.bot.onText(/\/matches/, this.handleMatches.bind(this));
        this.bot.onText(/\/leaderboard/, this.handleLeaderboard.bind(this));
        this.bot.onText(/\/stats/, this.handleStats.bind(this));
        this.bot.onText(/\/predict (\d+) (\d+):(\d+)/, this.handlePredictCommand.bind(this));
        
        // Админские команды
        this.bot.onText(/\/addmatch/, this.handleAddMatch.bind(this));
        this.bot.onText(/\/finishmatch (\d+) (\d+):(\d+)/, this.handleFinishMatch.bind(this));
        this.bot.onText(/\/addpoints/, this.handleAddPoints.bind(this));
        this.bot.onText(/\/setpoints/, this.handleSetPoints.bind(this));
        this.bot.onText(/\/pointshistory/, this.handlePointsHistory.bind(this));
        this.bot.onText(/\/newseason/, this.handleNewSeason.bind(this));
        this.bot.onText(/\/currentseason/, this.handleCurrentSeason.bind(this));
        this.bot.onText(/\/seasonhistory/, this.handleSeasonHistory.bind(this));
        this.bot.onText(/\/admins/, this.handleAdmins.bind(this));
        this.bot.onText(/\/addadmin/, this.handleAddAdmin.bind(this));
        this.bot.onText(/\/removeadmin/, this.handleRemoveAdmin.bind(this));
        this.bot.onText(/\/cancel/, this.handleCancel.bind(this));

        // Обработка callback данных
        this.bot.on('callback_query', this.handleCallback.bind(this));
        
        // Обработка текстовых сообщений
        this.bot.on('message', this.handleMessage.bind(this));

        // Обработка ошибок
        this.bot.on('error', (error) => {
            console.error('Ошибка бота:', error);
        });

        this.bot.on('polling_error', (error) => {
            console.error('Ошибка polling:', error);
        });
    }

    async handleStart(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username;
        const firstName = msg.from.first_name;
        const lastName = msg.from.last_name;

        try {
            await this.db.addUser(userId, username, firstName, lastName);
            
            const welcomeText = `
🏆 *Добро пожаловать в бот прогнозов на футбол!*

Здесь вы можете делать прогнозы на матчи и зарабатывать баллы:

🎯 *Точный результат* — 3 балла
🎲 *Разница мячей и исход* — 2 балла  
⚽ *Угаданный исход* — 1 балл

Используйте /help для просмотра всех команд.
            `;

            await this.bot.sendMessage(chatId, welcomeText, {
                parse_mode: 'Markdown',
                reply_markup: this.getMainKeyboard()
            });
        } catch (error) {
            console.error('Ошибка при добавлении пользователя:', error);
            await this.bot.sendMessage(chatId, 'Произошла ошибка при регистрации.');
        }
    }

    async handleHelp(msg) {
        const chatId = msg.chat.id;
        
        const helpText = `
📖 *Доступные команды:*

👤 *Пользователю:*
/start — Начать работу с ботом
/matches — Показать активные матчи
/leaderboard — Таблица лидеров
/stats — Ваша статистика
/predict [ID] [счет] — Сделать прогноз
Пример: /predict 1 2:1

🔧 *Администратору:*
/addmatch — Добавить новый матч
/finishmatch [ID] [счет] — Завершить матч
Пример: /finishmatch 1 2:1
/addpoints — Добавить/отнять баллы пользователю
/setpoints — Установить баллы пользователю
/pointshistory — История изменений баллов
/newseason — Начать новый сезон (обнулить баллы)
/currentseason — Информация о текущем сезоне
/seasonhistory — История всех сезонов
/admins — Список администраторов
/addadmin — Добавить администратора (только главный админ)
/removeadmin — Удалить администратора (только главный админ)
/cancel — Отменить текущее действие

💡 *Как делать прогнозы:*
1. Посмотрите активные матчи (/matches)
2. Нажмите "Сделать прогноз" под матчем
3. Введите ваш прогноз счета
4. Ждите окончания матча для получения баллов
        `;

        await this.bot.sendMessage(chatId, helpText, {
            parse_mode: 'Markdown',
            reply_markup: this.getMainKeyboard()
        });
    }

    async handleMatches(msg) {
        const chatId = msg.chat.id;
        
        try {
            const matches = await this.db.getActiveMatches();
            
            if (matches.length === 0) {
                await this.bot.sendMessage(chatId, '📭 Активных матчей пока нет.');
                return;
            }

            const text = '⚽ *Активные матчи:*\n\n';
            
            for (const match of matches) {
                const matchText = await this.formatMatchInfo(match, msg.from.id);
                const keyboard = this.getMatchKeyboard(match.id);
                
                await this.bot.sendMessage(chatId, matchText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
        } catch (error) {
            console.error('Ошибка при получении матчей:', error);
            await this.bot.sendMessage(chatId, 'Ошибка при загрузке матчей.');
        }
    }

    async handleLeaderboard(msg) {
        const chatId = msg.chat.id;
        
        try {
            const currentSeason = await this.db.getCurrentSeason();
            const leaders = await this.db.getLeaderboard(10);
            
            if (leaders.length === 0) {
                await this.bot.sendMessage(chatId, '📊 Таблица лидеров пока пуста.');
                return;
            }

            const seasonInfo = currentSeason ? `🏆 *Таблица лидеров ${currentSeason.name}:*\n\n` : '🏆 *Таблица лидеров:*\n\n';
            let text = seasonInfo;
            
            leaders.forEach((user, index) => {
                const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;
                const name = user.first_name || user.username || 'Аноним';
                text += `${medal} ${name} — ${user.total_points} балл${this.getPointsWord(user.total_points)}\n`;
            });

            if (currentSeason) {
                const startDate = moment(currentSeason.start_date).format('DD.MM.YYYY');
                const duration = moment().diff(moment(currentSeason.start_date), 'days');
                text += `\n📅 Сезон начат: ${startDate} (${duration} дней назад)`;
            }

            await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ошибка при получении таблицы лидеров:', error);
            await this.bot.sendMessage(chatId, 'Ошибка при загрузке таблицы лидеров.');
        }
    }

    async handleStats(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        try {
            const user = await this.db.getUser(userId);
            const currentSeason = await this.db.getCurrentSeason();
            const stats = await this.db.getUserStats(userId);
            
            if (!user) {
                await this.bot.sendMessage(chatId, 'Пользователь не найден. Используйте /start');
                return;
            }

            const name = user.first_name || user.username || 'Аноним';
            const seasonInfo = currentSeason ? ` (${currentSeason.name})` : '';
            
            let text = `📊 *Статистика ${name}${seasonInfo}:*\n\n`;
            text += `🏆 Текущий счет: ${user.total_points} балл${this.getPointsWord(user.total_points)}\n`;
            
            if (stats && stats.total_predictions > 0) {
                text += `📈 Всего прогнозов: ${stats.total_predictions}\n`;
                text += `🎯 Точных результатов: ${stats.exact_predictions || 0}\n`;
                text += `🎲 Разница + исход: ${stats.close_predictions || 0}\n`;
                text += `⚽ Только исход: ${stats.outcome_predictions || 0}\n`;
                text += `❌ Неточных/ожидающих: ${stats.incorrect_predictions || 0}\n`;
                
                const accuracy = ((stats.exact_predictions || 0) / stats.total_predictions * 100).toFixed(1);
                text += `📊 Точность: ${accuracy}%\n`;
                text += `💰 Заработано баллов: ${stats.total_points_earned || 0}`;
            } else {
                text += '\n🤷‍♂️ Прогнозов в этом сезоне пока нет. Сделайте свой первый!';
            }

            // Показываем информацию о предыдущих сезонах, если есть
            if (currentSeason && currentSeason.season_number > 1) {
                try {
                    const prevSeasonStats = await this.db.getUserSeasonStats(userId, currentSeason.season_number - 1);
                    if (prevSeasonStats && !prevSeasonStats.is_current) {
                        text += `\n\n📚 *Прошлый сезон:*\n`;
                        text += `🏆 Место: ${prevSeasonStats.position}\n`;
                        text += `📊 Баллы: ${prevSeasonStats.final_points}\n`;
                        text += `🎯 Точных: ${prevSeasonStats.exact_predictions}`;
                    }
                } catch (err) {
                    console.error('Ошибка при получении статистики прошлого сезона:', err);
                }
            }

            await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ошибка при получении статистики:', error);
            await this.bot.sendMessage(chatId, 'Ошибка при загрузке статистики.');
        }
    }

    async handlePredictCommand(msg, match) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const matchId = parseInt(match[1]);
        const predA = parseInt(match[2]);
        const predB = parseInt(match[3]);

        await this.makePrediction(chatId, userId, matchId, predA, predB);
    }

    async handleAddMatch(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!(await this.isAdmin(userId))) {
            await this.bot.sendMessage(chatId, '❌ У вас нет прав для добавления матчей.');
            return;
        }

        this.userStates.set(userId, { action: 'add_match', step: 'team_a' });
        await this.bot.sendMessage(chatId, '⚽ Введите название первой команды:', {
            reply_markup: { 
                keyboard: [['❌ Отмена']], 
                resize_keyboard: true 
            }
        });
    }

    async handleFinishMatch(msg, match) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!(await this.isAdmin(userId))) {
            await this.bot.sendMessage(chatId, '❌ У вас нет прав для завершения матчей.');
            return;
        }

        const matchId = parseInt(match[1]);
        const resultA = parseInt(match[2]);
        const resultB = parseInt(match[3]);

        await this.finishMatch(chatId, matchId, resultA, resultB, userId);
    }

    async handleCancel(msg) {
        const userId = msg.from.id;
        const chatId = msg.chat.id;

        this.userStates.delete(userId);
        await this.bot.sendMessage(chatId, '❌ Действие отменено.', {
            reply_markup: this.getMainKeyboard()
        });
    }

    async handleCallback(callbackQuery) {
        const data = callbackQuery.data;
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;

        try {
            if (data.startsWith('predict_')) {
                const matchId = parseInt(data.split('_')[1]);
                await this.startPredictionProcess(chatId, userId, matchId);
            } else if (data.startsWith('finish_')) {
                const matchId = parseInt(data.split('_')[1]);
                await this.startFinishMatchProcess(chatId, userId, matchId);
            } else if (data === 'view_matches') {
                await this.handleViewMatchesCallback(chatId);
            }

            await this.bot.answerCallbackQuery(callbackQuery.id);
        } catch (error) {
            console.error('Ошибка при обработке callback:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Произошла ошибка' });
        }
    }

    async handleMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        // Пропускаем команды
        if (text && text.startsWith('/')) return;

        // Обработка кнопок главной клавиатуры (работают всегда)
        if (text === '⚽ Матчи') {
            try {
                await this.handleMatches(msg);
            } catch (error) {
                console.error('Ошибка при обработке кнопки "Матчи":', error);
                await this.bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте еще раз.');
            }
            return;
        }
        
        if (text === '🏆 Таблица лидеров') {
            try {
                await this.handleLeaderboard(msg);
            } catch (error) {
                console.error('Ошибка при обработке кнопки "Таблица лидеров":', error);
                await this.bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте еще раз.');
            }
            return;
        }
        
        if (text === '📊 Моя статистика') {
            try {
                await this.handleStats(msg);
            } catch (error) {
                console.error('Ошибка при обработке кнопки "Моя статистика":', error);
                await this.bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте еще раз.');
            }
            return;
        }
        
        if (text === '❓ Помощь') {
            try {
                await this.handleHelp(msg);
            } catch (error) {
                console.error('Ошибка при обработке кнопки "Помощь":', error);
                await this.bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте еще раз.');
            }
            return;
        }

        const userState = this.userStates.get(userId);
        if (!userState) return;

        try {
            if (text === '❌ Отмена') {
                await this.handleCancel(msg);
                return;
            }

            if (userState.action === 'add_match') {
                await this.handleAddMatchProcess(msg, userState);
            } else if (userState.action === 'make_prediction') {
                await this.handlePredictionProcess(msg, userState);
            } else if (userState.action === 'finish_match') {
                await this.handleFinishMatchProcess(msg, userState);
            } else if (userState.action === 'add_points') {
                await this.handleAddPointsProcess(msg, userState);
            } else if (userState.action === 'set_points') {
                await this.handleSetPointsProcess(msg, userState);
            } else if (userState.action === 'new_season') {
                await this.handleNewSeasonProcess(msg, userState);
            } else if (userState.action === 'add_admin') {
                await this.handleAddAdminProcess(msg, userState);
            } else if (userState.action === 'remove_admin') {
                await this.handleRemoveAdminProcess(msg, userState);
            }
        } catch (error) {
            console.error('Ошибка при обработке сообщения:', error);
            await this.bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте еще раз.');
        }
    }

    async handleAddMatchProcess(msg, userState) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        if (userState.step === 'team_a') {
            userState.teamA = text;
            userState.step = 'team_b';
            await this.bot.sendMessage(chatId, '⚽ Введите название второй команды:');
        } else if (userState.step === 'team_b') {
            userState.teamB = text;
            userState.step = 'date';
            await this.bot.sendMessage(chatId, '📅 Введите дату и время матча (формат: ДД.ММ.ГГГГ ЧЧ:ММ):\nПример: 25.12.2023 20:00');
        } else if (userState.step === 'date') {
            const matchDate = this.parseDate(text);
            if (!matchDate) {
                await this.bot.sendMessage(chatId, '❌ Неверный формат даты. Используйте: ДД.ММ.ГГГГ ЧЧ:ММ', {
                    reply_markup: { 
                        keyboard: [['❌ Отмена']], 
                        resize_keyboard: true 
                    }
                });
                return;
            }

            try {
                const matchId = await this.db.addMatch(userState.teamA, userState.teamB, matchDate.toISOString());
                this.userStates.delete(userId);
                
                await this.bot.sendMessage(chatId, 
                    `✅ Матч добавлен!\n\n⚽ ${userState.teamA} — ${userState.teamB}\n📅 ${matchDate.format('DD.MM.YYYY HH:mm')}`,
                    { reply_markup: this.getMainKeyboard() }
                );
            } catch (error) {
                console.error('Ошибка при добавлении матча:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при добавлении матча.');
            }
        }
    }

    async startFinishMatchProcess(chatId, userId, matchId) {
        try {
            // Проверяем права администратора
            if (!(await this.isAdmin(userId))) {
                await this.bot.sendMessage(chatId, '❌ Только администраторы могут завершать матчи.');
                return;
            }

            const match = await this.db.getMatch(matchId);
            if (!match) {
                await this.bot.sendMessage(chatId, '❌ Матч не найден.');
                return;
            }

            if (match.is_finished) {
                await this.bot.sendMessage(chatId, '❌ Матч уже завершен.');
                return;
            }

            this.userStates.set(userId, { action: 'finish_match', matchId: matchId });
            
            await this.bot.sendMessage(chatId, 
                `🏁 Завершение матча:\n⚽ ${match.team_a} — ${match.team_b}\n📅 ${moment(match.match_date).format('DD.MM.YYYY HH:mm')}\n\nВведите результат матча в формате "X:Y" (например, 2:1):`,
                {
                    reply_markup: { 
                        keyboard: [['❌ Отмена']], 
                        resize_keyboard: true 
                    }
                }
            );
        } catch (error) {
            console.error('Ошибка при начале процесса завершения матча:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при завершении матча.');
        }
    }

    async handlePredictionProcess(msg, userState) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        const match = text.match(/^(\d+):(\d+)$/);
        if (!match) {
            await this.bot.sendMessage(chatId, '❌ Неверный формат. Введите прогноз в формате "X:Y" (например, 2:1)', {
                reply_markup: { 
                    keyboard: [['❌ Отмена']], 
                    resize_keyboard: true 
                }
            });
            return;
        }

        const predA = parseInt(match[1]);
        const predB = parseInt(match[2]);

        if (!ScoringSystem.isValidPrediction(predA, predB)) {
            await this.bot.sendMessage(chatId, '❌ Некорректный прогноз. Результат должен быть от 0 до 20 голов.', {
                reply_markup: { 
                    keyboard: [['❌ Отмена']], 
                    resize_keyboard: true 
                }
            });
            return;
        }

        await this.makePrediction(chatId, userId, userState.matchId, predA, predB);
    }

    async handleFinishMatchProcess(msg, userState) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        const match = text.match(/^(\d+):(\d+)$/);
        if (!match) {
            await this.bot.sendMessage(chatId, '❌ Неверный формат. Введите результат в формате "X:Y" (например, 2:1)', {
                reply_markup: { 
                    keyboard: [['❌ Отмена']], 
                    resize_keyboard: true 
                }
            });
            return;
        }

        const resultA = parseInt(match[1]);
        const resultB = parseInt(match[2]);

        if (!ScoringSystem.isValidPrediction(resultA, resultB)) {
            await this.bot.sendMessage(chatId, '❌ Некорректный результат. Счет должен быть от 0 до 20 голов.', {
                reply_markup: { 
                    keyboard: [['❌ Отмена']], 
                    resize_keyboard: true 
                }
            });
            return;
        }

        await this.finishMatch(chatId, userState.matchId, resultA, resultB, userId);
    }

    async startPredictionProcess(chatId, userId, matchId) {
        try {
            const match = await this.db.getMatch(matchId);
            if (!match) {
                await this.bot.sendMessage(chatId, '❌ Матч не найден.');
                return;
            }

            if (match.is_finished) {
                await this.bot.sendMessage(chatId, '❌ Матч уже завершен.');
                return;
            }

            // Проверяем, не началось ли время матча
            const matchTime = moment(match.match_date);
            if (moment().isAfter(matchTime)) {
                await this.bot.sendMessage(chatId, '❌ Время для прогнозов на этот матч истекло.');
                return;
            }

            this.userStates.set(userId, { action: 'make_prediction', matchId: matchId });
            
            const existing = await this.db.getPrediction(userId, matchId);
            const existingText = existing ? `\n\n🔄 Ваш текущий прогноз: ${ScoringSystem.formatPrediction(existing.prediction_a, existing.prediction_b)}` : '';
            
            await this.bot.sendMessage(chatId, 
                `⚽ ${match.team_a} — ${match.team_b}\n📅 ${moment(match.match_date).format('DD.MM.YYYY HH:mm')}\n\nВведите ваш прогноз в формате "X:Y" (например, 2:1):${existingText}`,
                {
                    reply_markup: { 
                        keyboard: [['❌ Отмена']], 
                        resize_keyboard: true 
                    }
                }
            );
        } catch (error) {
            console.error('Ошибка при начале процесса прогноза:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при создании прогноза.');
        }
    }

    async makePrediction(chatId, userId, matchId, predA, predB) {
        try {
            const match = await this.db.getMatch(matchId);
            if (!match) {
                await this.bot.sendMessage(chatId, '❌ Матч не найден.', {
                    reply_markup: this.getMainKeyboard()
                });
                // Удаляем состояние пользователя при ошибке
                this.userStates.delete(userId);
                return;
            }

            if (match.is_finished) {
                await this.bot.sendMessage(chatId, '❌ Матч уже завершен.', {
                    reply_markup: this.getMainKeyboard()
                });
                // Удаляем состояние пользователя при ошибке
                this.userStates.delete(userId);
                return;
            }

            // Проверяем время
            const matchTime = moment(match.match_date);
            if (moment().isAfter(matchTime)) {
                await this.bot.sendMessage(chatId, '❌ Время для прогнозов на этот матч истекло.', {
                    reply_markup: this.getMainKeyboard()
                });
                // Удаляем состояние пользователя при ошибке
                this.userStates.delete(userId);
                return;
            }

            await this.db.addPrediction(userId, matchId, predA, predB);
            
            await this.bot.sendMessage(chatId, 
                `✅ Прогноз принят!\n\n⚽ ${match.team_a} — ${match.team_b}\n🔮 Ваш прогноз: ${ScoringSystem.formatPrediction(predA, predB)}\n📅 Матч: ${moment(match.match_date).format('DD.MM.YYYY HH:mm')}`,
                { reply_markup: this.getMainKeyboard() }
            );
            // Удаляем состояние пользователя после успешного создания прогноза
            this.userStates.delete(userId);
        } catch (error) {
            console.error('Ошибка при сохранении прогноза:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при сохранении прогноза.', {
                reply_markup: this.getMainKeyboard()
            });
            // Удаляем состояние пользователя при ошибке
            this.userStates.delete(userId);
        }
    }

    async finishMatch(chatId, matchId, resultA, resultB, userId = null) {
        try {
            const match = await this.db.getMatch(matchId);
            if (!match) {
                await this.bot.sendMessage(chatId, '❌ Матч не найден.', {
                    reply_markup: this.getMainKeyboard()
                });
                // Удаляем состояние пользователя при ошибке
                if (userId) this.userStates.delete(userId);
                return;
            }

            if (match.is_finished) {
                await this.bot.sendMessage(chatId, '❌ Матч уже завершен.', {
                    reply_markup: this.getMainKeyboard()
                });
                // Удаляем состояние пользователя при ошибке
                if (userId) this.userStates.delete(userId);
                return;
            }

            // Завершаем матч
            await this.db.finishMatch(matchId, resultA, resultB);

            // Получаем все прогнозы на этот матч
            const predictions = await this.db.getPredictionsForMatch(matchId);

            // Подсчитываем баллы для каждого прогноза
            for (const prediction of predictions) {
                const points = ScoringSystem.calculatePoints(
                    prediction.prediction_a, 
                    prediction.prediction_b, 
                    resultA, 
                    resultB
                );

                // Обновляем баллы в прогнозе
                await this.db.updatePredictionPoints(prediction.user_id, matchId, points);
                
                // Добавляем баллы пользователю
                if (points > 0) {
                    await this.db.updateUserPoints(prediction.user_id, points);
                }
            }

            // Отправляем результаты
            let resultText = `🏁 *Матч завершен!*\n\n`;
            resultText += `⚽ ${match.team_a} ${resultA}:${resultB} ${match.team_b}\n\n`;
            
            if (predictions.length > 0) {
                resultText += `📊 *Результаты прогнозов:*\n\n`;
                
                predictions.forEach(pred => {
                    const points = ScoringSystem.calculatePoints(pred.prediction_a, pred.prediction_b, resultA, resultB);
                    const name = pred.first_name || pred.username || 'Аноним';
                    const emoji = ScoringSystem.getPointsEmoji(points);
                    resultText += `${emoji} ${name}: ${ScoringSystem.formatPrediction(pred.prediction_a, pred.prediction_b)} (+${points})\n`;
                });
            } else {
                resultText += `😔 На этот матч не было прогнозов.`;
            }

            await this.bot.sendMessage(chatId, resultText, { 
                parse_mode: 'Markdown',
                reply_markup: this.getMainKeyboard()
            });
            
            // Удаляем состояние пользователя после успешного завершения матча
            if (userId) this.userStates.delete(userId);

        } catch (error) {
            console.error('Ошибка при завершении матча:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при завершении матча.', {
                reply_markup: this.getMainKeyboard()
            });
            // Удаляем состояние пользователя при ошибке
            if (userId) this.userStates.delete(userId);
        }
    }

    async handleAddPoints(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!(await this.isAdmin(userId))) {
            await this.bot.sendMessage(chatId, '❌ У вас нет прав для изменения баллов.');
            return;
        }

        this.userStates.set(userId, { action: 'add_points', step: 'user_search' });
        await this.bot.sendMessage(chatId, '👤 Введите username пользователя (с @ или без) или часть имени для поиска:', {
            reply_markup: { 
                keyboard: [['❌ Отмена']], 
                resize_keyboard: true 
            }
        });
    }

    async handleSetPoints(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!(await this.isAdmin(userId))) {
            await this.bot.sendMessage(chatId, '❌ У вас нет прав для изменения баллов.');
            return;
        }

        this.userStates.set(userId, { action: 'set_points', step: 'user_search' });
        await this.bot.sendMessage(chatId, '👤 Введите username пользователя (с @ или без) или часть имени для поиска:', {
            reply_markup: { 
                keyboard: [['❌ Отмена']], 
                resize_keyboard: true 
            }
        });
    }

    async handlePointsHistory(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!(await this.isAdmin(userId))) {
            await this.bot.sendMessage(chatId, '❌ У вас нет прав для просмотра истории.');
            return;
        }

        try {
            const history = await this.db.getPointsHistory(null, 15);
            
            if (history.length === 0) {
                await this.bot.sendMessage(chatId, '📊 История изменений баллов пуста.');
                return;
            }

            let text = '📊 *История изменений баллов:*\n\n';
            
            history.forEach((record, index) => {
                const userName = record.user_first_name || record.user_username || 'Аноним';
                const adminName = record.admin_first_name || record.admin_username || 'Админ';
                const actionText = record.action_type === 'add' ? 'добавил' : 'установил';
                const pointsText = record.action_type === 'add' ? 
                    `${record.points_change > 0 ? '+' : ''}${record.points_change}` : 
                    `${record.new_total} (было ${record.old_total})`;
                
                const date = moment(record.created_at).format('DD.MM HH:mm');
                
                text += `${index + 1}. ${userName}: ${actionText} ${pointsText} балл${this.getPointsWord(Math.abs(record.points_change))}\n`;
                text += `   🔸 ${adminName}, ${date}`;
                if (record.reason) {
                    text += `\n   💬 "${record.reason}"`;
                }
                text += '\n\n';
            });

            await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ошибка при получении истории:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке истории.');
        }
    }

    async handleAddPointsProcess(msg, userState) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        if (userState.step === 'user_search') {
            await this.processUserSearch(chatId, userId, text, userState, 'add_points');
        } else if (userState.step === 'points_amount') {
            await this.processPointsAmount(chatId, userId, text, userState, 'add');
        } else if (userState.step === 'reason') {
            await this.processPointsReason(chatId, userId, text, userState, 'add');
        }
    }

    async handleSetPointsProcess(msg, userState) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        if (userState.step === 'user_search') {
            await this.processUserSearch(chatId, userId, text, userState, 'set_points');
        } else if (userState.step === 'points_amount') {
            await this.processPointsAmount(chatId, userId, text, userState, 'set');
        } else if (userState.step === 'reason') {
            await this.processPointsReason(chatId, userId, text, userState, 'set');
        }
    }

    async processUserSearch(chatId, userId, searchText, userState, action) {
        try {
            // Убираем @ если есть
            const cleanSearch = searchText.replace('@', '');
            
            const users = await this.db.searchUserByUsernameOrName(cleanSearch);
            
            if (users.length === 0) {
                await this.bot.sendMessage(chatId, '❌ Пользователи не найдены. Попробуйте другой запрос или введите /cancel для отмены.');
                return;
            }

            if (users.length === 1) {
                // Найден один пользователь
                userState.targetUser = users[0];
                userState.step = 'points_amount';
                
                const userName = users[0].first_name || users[0].username || 'Аноним';
                const actionText = action === 'add_points' ? 'добавить' : 'установить';
                
                await this.bot.sendMessage(chatId, 
                    `✅ Выбран пользователь: ${userName} (${users[0].total_points} балл${this.getPointsWord(users[0].total_points)})\n\n` +
                    `💯 Введите количество баллов для ${actionText === 'добавить' ? 'добавления' : 'установки'}:\n` +
                    `${action === 'add_points' ? '(используйте + или - для добавления/вычитания)' : '(укажите итоговое количество баллов)'}`
                );
            } else {
                // Найдено несколько пользователей
                let text = '👥 Найдено несколько пользователей. Введите более точный запрос:\n\n';
                
                users.slice(0, 10).forEach((user, index) => {
                    const name = user.first_name || user.username || 'Аноним';
                    const username = user.username ? `@${user.username}` : '';
                    text += `${index + 1}. ${name} ${username} (${user.total_points} балл${this.getPointsWord(user.total_points)})\n`;
                });
                
                if (users.length > 10) {
                    text += `\n... и еще ${users.length - 10} пользователей`;
                }

                await this.bot.sendMessage(chatId, text);
            }
        } catch (error) {
            console.error('Ошибка поиска пользователя:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при поиске пользователя.');
        }
    }

    async processPointsAmount(chatId, userId, text, userState, action) {
        const points = parseInt(text);
        
        if (isNaN(points)) {
            await this.bot.sendMessage(chatId, '❌ Введите корректное число.', {
                reply_markup: { 
                    keyboard: [['❌ Отмена']], 
                    resize_keyboard: true 
                }
            });
            return;
        }

        if (action === 'set' && points < 0) {
            await this.bot.sendMessage(chatId, '❌ Количество баллов не может быть отрицательным при установке.', {
                reply_markup: { 
                    keyboard: [['❌ Отмена']], 
                    resize_keyboard: true 
                }
            });
            return;
        }

        userState.points = points;
        userState.step = 'reason';
        
        const userName = userState.targetUser.first_name || userState.targetUser.username || 'Аноним';
        const actionText = action === 'add' ? 
            `${points > 0 ? 'добавить' : 'отнять'} ${Math.abs(points)}` : 
            `установить ${points}`;
        
        await this.bot.sendMessage(chatId, 
            `📝 Укажите причину изменения баллов для ${userName} (${actionText} балл${this.getPointsWord(Math.abs(points))}):\n\n` +
            `Или нажмите "Пропустить" для продолжения без комментария.`,
            {
                reply_markup: { 
                    keyboard: [['Пропустить'], ['❌ Отмена']], 
                    resize_keyboard: true 
                }
            }
        );
    }

    async processPointsReason(chatId, userId, text, userState, action) {
        try {
            const reason = text === 'Пропустить' ? null : text;
            const targetUserId = userState.targetUser.telegram_id;
            const points = userState.points;
            
            let result;
            if (action === 'add') {
                result = await this.db.addPointsToUser(targetUserId, points, userId, reason);
            } else {
                result = await this.db.setUserPoints(targetUserId, points, userId, reason);
            }

            this.userStates.delete(userId);
            
            const userName = userState.targetUser.first_name || userState.targetUser.username || 'Аноним';
            const actionText = action === 'add' ? 
                `${points > 0 ? 'добавлено' : 'отнято'} ${Math.abs(points)}` : 
                `установлено ${points}`;
            
            let responseText = `✅ Баллы обновлены!\n\n`;
            responseText += `👤 Пользователь: ${userName}\n`;
            responseText += `📊 Было: ${result.oldTotal} балл${this.getPointsWord(result.oldTotal)}\n`;
            responseText += `📊 Стало: ${result.newTotal} балл${this.getPointsWord(result.newTotal)}\n`;
            responseText += `🔄 Изменение: ${actionText} балл${this.getPointsWord(Math.abs(points))}`;
            
            if (reason) {
                responseText += `\n💬 Причина: ${reason}`;
            }

            await this.bot.sendMessage(chatId, responseText, {
                reply_markup: this.getMainKeyboard()
            });

            // Уведомляем пользователя об изменении баллов
            if (targetUserId !== userId) {
                try {
                    let notificationText = `🔔 Ваши баллы были изменены администратором!\n\n`;
                    notificationText += `📊 Было: ${result.oldTotal} балл${this.getPointsWord(result.oldTotal)}\n`;
                    notificationText += `📊 Стало: ${result.newTotal} балл${this.getPointsWord(result.newTotal)}\n`;
                    notificationText += `🔄 ${actionText} балл${this.getPointsWord(Math.abs(points))}`;
                    
                    if (reason) {
                        notificationText += `\n💬 Причина: ${reason}`;
                    }

                    await this.bot.sendMessage(targetUserId, notificationText);
                } catch (error) {
                    console.log('Не удалось отправить уведомление пользователю:', error.message);
                }
            }

        } catch (error) {
            console.error('Ошибка при изменении баллов:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при изменении баллов: ' + error.message);
        }
    }

    async handleNewSeason(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!(await this.isAdmin(userId))) {
            await this.bot.sendMessage(chatId, '❌ У вас нет прав для создания нового сезона.');
            return;
        }

        try {
            const currentSeason = await this.db.getCurrentSeason();
            if (!currentSeason) {
                await this.bot.sendMessage(chatId, '❌ Текущий сезон не найден.');
                return;
            }

            this.userStates.set(userId, { action: 'new_season', step: 'confirm' });
            
            await this.bot.sendMessage(chatId, 
                `⚠️ *ВНИМАНИЕ!*\n\nВы собираетесь начать новый сезон.\n\n` +
                `📊 Текущий сезон: ${currentSeason.name}\n` +
                `🔄 Это действие:\n` +
                `• Закроет текущий сезон\n` +
                `• Сохранит результаты в архив\n` +
                `• Обнулит баллы ВСЕХ участников\n` +
                `• Создаст Сезон ${currentSeason.season_number + 1}\n\n` +
                `Вы уверены? Введите название нового сезона или "Подтвердить" для стандартного названия:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: { 
                        keyboard: [['Подтвердить'], ['❌ Отмена']], 
                        resize_keyboard: true 
                    }
                }
            );
        } catch (error) {
            console.error('Ошибка при проверке сезона:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при получении информации о сезоне.');
        }
    }

    async handleCurrentSeason(msg) {
        const chatId = msg.chat.id;

        try {
            const currentSeason = await this.db.getCurrentSeason();
            if (!currentSeason) {
                await this.bot.sendMessage(chatId, '❌ Активный сезон не найден.');
                return;
            }

            const startDate = moment(currentSeason.start_date).format('DD.MM.YYYY');
            const duration = moment().diff(moment(currentSeason.start_date), 'days');

            let text = `🏆 *${currentSeason.name}*\n\n`;
            text += `📅 Начат: ${startDate}\n`;
            text += `⏰ Продолжительность: ${duration} дней\n`;
            text += `🔢 Номер сезона: ${currentSeason.season_number}`;

            await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ошибка при получении информации о сезоне:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при получении информации о сезоне.');
        }
    }

    async handleSeasonHistory(msg) {
        const chatId = msg.chat.id;

        try {
            const seasons = await this.db.getSeasonHistory(10);
            
            if (seasons.length === 0) {
                await this.bot.sendMessage(chatId, '📊 История сезонов пуста.');
                return;
            }

            let text = '📚 *История сезонов:*\n\n';
            
            for (const season of seasons) {
                const startDate = moment(season.start_date).format('DD.MM.YYYY');
                const endDate = season.end_date ? moment(season.end_date).format('DD.MM.YYYY') : 'продолжается';
                const status = season.is_active ? '🟢 Активный' : '🔴 Завершен';
                
                text += `${season.season_number}. **${season.name}** ${status}\n`;
                text += `   📅 ${startDate} — ${endDate}\n`;
                
                if (!season.is_active) {
                    // Показываем топ-3 сезона
                    try {
                        const results = await this.db.getSeasonResults(season.season_number, 3);
                        if (results.length > 0) {
                            text += `   🏆 Топ-3: `;
                            results.forEach((result, index) => {
                                const name = result.first_name || result.username || 'Аноним';
                                const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
                                text += `${medal}${name}(${result.final_points}) `;
                            });
                            text += '\n';
                        }
                    } catch (err) {
                        console.error('Ошибка при получении результатов сезона:', err);
                    }
                }
                text += '\n';
            }

            await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ошибка при получении истории сезонов:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке истории сезонов.');
        }
    }

    async handleNewSeasonProcess(msg, userState) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        if (userState.step === 'confirm') {
            try {
                const seasonName = text === 'Подтвердить' ? null : text;
                
                const result = await this.db.createNewSeason(seasonName, userId);
                this.userStates.delete(userId);

                let responseText = `🎉 *Новый сезон начат!*\n\n`;
                responseText += `🏆 Сезон: ${result.seasonName}\n`;
                responseText += `🔢 Номер: ${result.newSeasonNumber}\n`;
                responseText += `👥 Обнулено пользователей: ${result.usersReset}\n\n`;
                responseText += `🚀 Желаем всем удачи в новом сезоне!`;

                await this.bot.sendMessage(chatId, responseText, {
                    parse_mode: 'Markdown',
                    reply_markup: this.getMainKeyboard()
                });

                // Отправляем уведомление всем участникам
                await this.notifyAllUsersAboutNewSeason(result.seasonName, result.newSeasonNumber);

            } catch (error) {
                console.error('Ошибка при создании нового сезона:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при создании нового сезона: ' + error.message);
                this.userStates.delete(userId);
            }
        }
    }

    async notifyAllUsersAboutNewSeason(seasonName, seasonNumber) {
        try {
            const users = await this.db.getLeaderboard(1000); // Получаем всех пользователей
            
            for (const user of users) {
                if (!(await this.isAdmin(user.telegram_id))) {
                    try {
                        await this.bot.sendMessage(user.telegram_id, 
                            `🎉 *Начался новый сезон!*\n\n` +
                            `🏆 ${seasonName}\n` +
                            `🔢 Сезон #${seasonNumber}\n\n` +
                            `📊 Ваши баллы обнулены.\n` +
                            `🚀 Удачи в новом сезоне!`,
                            { parse_mode: 'Markdown' }
                        );
                        
                        // Небольшая задержка между отправками
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (error) {
                        console.log(`Не удалось отправить уведомление пользователю ${user.telegram_id}:`, error.message);
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка при отправке уведомлений о новом сезоне:', error);
        }
    }

    async handleAdmins(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!(await this.isAdmin(userId))) {
            await this.bot.sendMessage(chatId, '❌ У вас нет прав для просмотра списка администраторов.');
            return;
        }

        try {
            const admins = await this.db.getAdmins();
            
            if (admins.length === 0) {
                await this.bot.sendMessage(chatId, '👥 Список администраторов пуст.');
                return;
            }

            let text = '👥 *Администраторы бота:*\n\n';
            
            admins.forEach((admin, index) => {
                const name = admin.first_name || admin.username || `ID: ${admin.user_id}`;
                const role = admin.is_super_admin ? '🔑 Главный админ' : '🔧 Администратор';
                const status = admin.is_active ? '🟢' : '🔴';
                text += `${index + 1}. ${status} ${name}\n   ${role}\n`;
                if (admin.added_at) {
                    text += `   📅 Добавлен: ${moment(admin.added_at).format('DD.MM.YYYY')}\n`;
                }
                text += '\n';
            });

            await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ошибка при получении списка администраторов:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке списка администраторов.');
        }
    }

    async handleAddAdmin(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!(await this.isSuperAdmin(userId))) {
            await this.bot.sendMessage(chatId, '❌ Только главный администратор может добавлять новых администраторов.');
            return;
        }

        this.userStates.set(userId, { action: 'add_admin', step: 'user_search' });
        await this.bot.sendMessage(chatId, '👤 Введите username пользователя (с @ или без) или часть имени для поиска:', {
            reply_markup: { 
                keyboard: [['❌ Отмена']], 
                resize_keyboard: true 
            }
        });
    }

    async handleRemoveAdmin(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!(await this.isSuperAdmin(userId))) {
            await this.bot.sendMessage(chatId, '❌ Только главный администратор может удалять администраторов.');
            return;
        }

        try {
            const admins = await this.db.getAdmins();
            const otherAdmins = admins.filter(admin => admin.user_id !== userId && admin.is_active);
            
            if (otherAdmins.length === 0) {
                await this.bot.sendMessage(chatId, '👥 Нет других администраторов для удаления.');
                return;
            }

            this.userStates.set(userId, { action: 'remove_admin', step: 'select_admin', admins: otherAdmins });
            
            let text = '👥 Выберите администратора для удаления:\n\n';
            otherAdmins.forEach((admin, index) => {
                const name = admin.first_name || admin.username || `ID: ${admin.user_id}`;
                const role = admin.is_super_admin ? '🔑' : '🔧';
                text += `${index + 1}. ${role} ${name}\n`;
            });
            text += '\nВведите номер администратора:';

            await this.bot.sendMessage(chatId, text, {
                reply_markup: { 
                    keyboard: [['❌ Отмена']], 
                    resize_keyboard: true 
                }
            });
        } catch (error) {
            console.error('Ошибка при получении списка администраторов:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке списка администраторов.');
        }
    }

    async handleAddAdminProcess(msg, userState) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        if (userState.step === 'user_search') {
            await this.processUserSearchForAdmin(chatId, userId, text, userState);
        } else if (userState.step === 'confirm') {
            await this.processAddAdminConfirm(chatId, userId, text, userState);
        }
    }

    async handleRemoveAdminProcess(msg, userState) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        if (userState.step === 'select_admin') {
            await this.processRemoveAdminSelect(chatId, userId, text, userState);
        }
    }

    async processUserSearchForAdmin(chatId, userId, searchText, userState) {
        try {
            const cleanSearch = searchText.replace('@', '');
            const users = await this.db.searchUserByUsernameOrName(cleanSearch);
            
            if (users.length === 0) {
                await this.bot.sendMessage(chatId, '❌ Пользователи не найдены. Попробуйте другой запрос.');
                return;
            }

            if (users.length === 1) {
                const targetUser = users[0];
                
                // Проверяем, не является ли пользователь уже администратором
                if (await this.isAdmin(targetUser.telegram_id)) {
                    await this.bot.sendMessage(chatId, '❌ Этот пользователь уже является администратором.');
                    return;
                }

                userState.targetUser = targetUser;
                userState.step = 'confirm';
                
                const userName = targetUser.first_name || targetUser.username || 'Аноним';
                
                await this.bot.sendMessage(chatId, 
                    `✅ Выбран пользователь: ${userName}\n\n` +
                    `Подтвердите добавление в администраторы:`,
                    {
                        reply_markup: { 
                            keyboard: [['Подтвердить'], ['❌ Отмена']], 
                            resize_keyboard: true 
                        }
                    }
                );
            } else {
                let text = '👥 Найдено несколько пользователей. Введите более точный запрос:\n\n';
                users.slice(0, 10).forEach((user, index) => {
                    const name = user.first_name || user.username || 'Аноним';
                    const username = user.username ? `@${user.username}` : '';
                    text += `${index + 1}. ${name} ${username}\n`;
                });
                
                await this.bot.sendMessage(chatId, text);
            }
        } catch (error) {
            console.error('Ошибка поиска пользователя для администратора:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при поиске пользователя.');
        }
    }

    async processAddAdminConfirm(chatId, userId, text, userState) {
        if (text !== 'Подтвердить') {
            await this.bot.sendMessage(chatId, '❌ Действие отменено.');
            this.userStates.delete(userId);
            return;
        }

        try {
            const targetUser = userState.targetUser;
            
            await this.db.addAdmin(
                targetUser.telegram_id, 
                targetUser.username, 
                targetUser.first_name, 
                targetUser.last_name, 
                false, 
                userId
            );

            this.userStates.delete(userId);
            
            const userName = targetUser.first_name || targetUser.username || 'Аноним';
            
            await this.bot.sendMessage(chatId, 
                `✅ Пользователь ${userName} добавлен в администраторы!`,
                { reply_markup: this.getMainKeyboard() }
            );

            // Уведомляем нового администратора
            try {
                await this.bot.sendMessage(targetUser.telegram_id, 
                    `🎉 Вы назначены администратором бота!\n\n` +
                    `Теперь у вас есть доступ к административным функциям.`
                );
            } catch (error) {
                console.log('Не удалось отправить уведомление новому администратору:', error.message);
            }

        } catch (error) {
            console.error('Ошибка при добавлении администратора:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при добавлении администратора.');
            this.userStates.delete(userId);
        }
    }

    async processRemoveAdminSelect(chatId, userId, text, userState) {
        const adminIndex = parseInt(text) - 1;
        
        if (isNaN(adminIndex) || adminIndex < 0 || adminIndex >= userState.admins.length) {
            await this.bot.sendMessage(chatId, '❌ Некорректный номер. Введите число от 1 до ' + userState.admins.length, {
                reply_markup: { 
                    keyboard: [['❌ Отмена']], 
                    resize_keyboard: true 
                }
            });
            return;
        }

        try {
            const targetAdmin = userState.admins[adminIndex];
            
            await this.db.removeAdmin(targetAdmin.user_id, userId);
            this.userStates.delete(userId);
            
            const adminName = targetAdmin.first_name || targetAdmin.username || `ID: ${targetAdmin.user_id}`;
            
            await this.bot.sendMessage(chatId, 
                `✅ Администратор ${adminName} удален из списка!`,
                { reply_markup: this.getMainKeyboard() }
            );

            // Уведомляем удаленного администратора
            try {
                await this.bot.sendMessage(targetAdmin.user_id, 
                    `📢 Вы больше не являетесь администратором бота.\n\n` +
                    `Доступ к административным функциям отозван.`
                );
            } catch (error) {
                console.log('Не удалось отправить уведомление удаленному администратору:', error.message);
            }

        } catch (error) {
            console.error('Ошибка при удалении администратора:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при удалении администратора.');
            this.userStates.delete(userId);
        }
    }

    async formatMatchInfo(match, userId) {
        const matchTime = moment(match.match_date);
        const isStarted = moment().isAfter(matchTime);
        
        let text = `⚽ **${match.team_a}** — **${match.team_b}**\n`;
        text += `📅 ${matchTime.format('DD.MM.YYYY HH:mm')}\n`;
        text += `🆔 Матч #${match.id}\n`;
        
        if (isStarted) {
            text += `⏰ Прогнозы закрыты\n`;
        }

        // Показываем прогноз пользователя, если есть
        try {
            const prediction = await this.db.getPrediction(userId, match.id);
            if (prediction) {
                text += `\n🔮 Ваш прогноз: ${ScoringSystem.formatPrediction(prediction.prediction_a, prediction.prediction_b)}`;
            }
        } catch (error) {
            console.error('Ошибка при получении прогноза:', error);
        }

        return text;
    }

    getMainKeyboard() {
        return {
            keyboard: [
                [
                    { text: '⚽ Матчи', callback_data: 'matches' },
                    { text: '🏆 Таблица лидеров', callback_data: 'leaderboard' },
                ],
                [
                    { text: '📊 Моя статистика', callback_data: 'stats' },
                    { text: '❓ Помощь', callback_data: 'help' },
                ],   
            ],
            resize_keyboard: true
        };
    }

    getMatchKeyboard(matchId) {
        return {
            inline_keyboard: [
                [
                    { text: '🔮 Сделать прогноз', callback_data: `predict_${matchId}` },
                    { text: '🔮 Матч завершен', callback_data: `finish_${matchId}` }
                ]
            ]
        };
    }

    parseDate(dateString) {
        const date = moment(dateString, 'DD.MM.YYYY HH:mm', true);
        return date.isValid() ? date : null;
    }

    getPointsWord(points) {
        const lastDigit = points % 10;
        const lastTwoDigits = points % 100;
        
        if (lastTwoDigits >= 10 && lastTwoDigits <= 20) {
            return 'ов';
        }
        
        if (lastDigit === 1) return '';
        if (lastDigit >= 2 && lastDigit <= 4) return 'а';
        return 'ов';
    }

    // Система уведомлений о матчах
    startMatchNotificationChecker() {
        // Проверяем каждые 5 минут
        this.notificationInterval = setInterval(() => {
            this.checkForMatchNotifications();
        }, 5 * 60 * 1000); // 5 минут

        // Также делаем первую проверку через 30 секунд после запуска
        setTimeout(() => {
            this.checkForMatchNotifications();
        }, 30 * 1000);

        console.log('🔔 Система уведомлений о матчах запущена');
    }

    async checkForMatchNotifications() {
        try {
            console.log('🔍 Проверка матчей для уведомлений...');
            const matches = await this.db.getMatchesForNotification();
            
            if (matches.length === 0) {
                console.log('📅 Нет матчей для уведомлений');
                return;
            }

            console.log(`📢 Найдено ${matches.length} матч${this.getPointsWord(matches.length)} для уведомлений`);
            
            for (const match of matches) {
                await this.sendMatchNotification(match);
            }
        } catch (error) {
            console.error('❌ Ошибка при проверке уведомлений о матчах:', error);
        }
    }

    async sendMatchNotification(match) {
        try {
            // Получаем только пользователей, которые еще не сделали прогноз на этот матч
            const usersWithoutPrediction = await this.db.getUsersWithoutPrediction(match.id);
            const allUsers = await this.db.getAllUsers();
            
            const matchTime = moment(match.match_date);
            const timeUntilMatch = moment.duration(matchTime.diff(moment()));
            
            const notificationText = `🚨 *Скоро матч!*\n\n` +
                `⚽ **${match.team_a}** — **${match.team_b}**\n` +
                `📅 ${matchTime.format('DD.MM.YYYY HH:mm')}\n` +
                `⏰ Начало через ${Math.round(timeUntilMatch.asMinutes())} минут\n\n` +
                `🔮 Не забудьте сделать свой прогноз!`;
            
            let successCount = 0;
            let failureCount = 0;
            let skippedCount = 0;

            console.log(`📊 Статистика пользователей для матча "${match.team_a} — ${match.team_b}":`);
            console.log(`   👥 Всего пользователей: ${allUsers.length}`);
            console.log(`   🔮 Уже сделали прогнозы: ${allUsers.length - usersWithoutPrediction.length}`);
            console.log(`   📤 Нужно уведомить: ${usersWithoutPrediction.length}`);

            if (usersWithoutPrediction.length === 0) {
                console.log(`✅ Все пользователи уже сделали прогнозы на матч "${match.team_a} — ${match.team_b}"`);
                // Отмечаем уведомление как отправленное, даже если никого не уведомляли
                await this.db.markMatchNotificationSent(match.id, 0);
                return;
            }

            for (const user of usersWithoutPrediction) {
                try {
                    await this.bot.sendMessage(user.telegram_id, notificationText, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '🔮 Сделать прогноз', callback_data: `predict_${match.id}` },
                                    { text: '⚽ Посмотреть матчи', callback_data: 'view_matches' }
                                ]
                            ]
                        }
                    });
                    successCount++;
                    
                    // Небольшая задержка между отправками, чтобы не превысить лимиты API
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    failureCount++;
                    console.log(`❌ Не удалось отправить уведомление пользователю ${user.telegram_id}:`, error.message);
                }
            }

            // Отмечаем уведомление как отправленное
            await this.db.markMatchNotificationSent(match.id, successCount);
            
            console.log(`✅ Уведомление о матче "${match.team_a} — ${match.team_b}" отправлено:`);
            console.log(`   📤 Успешно: ${successCount} пользователей`);
            if (failureCount > 0) {
                console.log(`   ❌ Неудачно: ${failureCount} пользователей`);
            }

        } catch (error) {
            console.error('❌ Ошибка при отправке уведомления о матче:', error);
        }
    }

    // Обработка callback для просмотра матчей из уведомления
    async handleViewMatchesCallback(chatId) {
        try {
            const matches = await this.db.getActiveMatches();
            
            if (matches.length === 0) {
                await this.bot.sendMessage(chatId, '📭 Активных матчей пока нет.');
                return;
            }

            let text = '⚽ *Активные матчи:*\n\n';
            
            for (const match of matches) {
                const matchTime = moment(match.match_date);
                const isStarted = moment().isAfter(matchTime);
                const timeInfo = isStarted ? '⏰ Прогнозы закрыты' : `📅 ${matchTime.format('DD.MM.YYYY HH:mm')}`;
                
                text += `🆔 #${match.id} **${match.team_a}** — **${match.team_b}**\n`;
                text += `${timeInfo}\n\n`;
            }

            await this.bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: this.getMainKeyboard()
            });
        } catch (error) {
            console.error('Ошибка при показе матчей из уведомления:', error);
            await this.bot.sendMessage(chatId, 'Ошибка при загрузке матчей.');
        }
    }

    // Корректное завершение работы
    async shutdown() {
        console.log('🛑 Получен сигнал завершения работы...');
        
        // Останавливаем HTTP сервер
        if (this.server) {
            console.log('🌐 Закрытие HTTP сервера...');
            this.server.close(() => {
                console.log('✅ HTTP сервер закрыт');
            });
        }

        // Останавливаем уведомления
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
            console.log('🔔 Система уведомлений остановлена');
        }

        // Останавливаем Telegram бота
        if (this.bot) {
            console.log('🤖 Остановка Telegram бота...');
            await this.bot.stopPolling();
            console.log('✅ Telegram бот остановлен');
        }

        // Закрываем базу данных
        if (this.db) {
            console.log('💾 Закрытие подключения к базе данных...');
            await this.db.close();
            console.log('✅ База данных закрыта');
        }

        console.log('👋 Бот завершил работу корректно');
        process.exit(0);
    }
}

// Запуск бота
const bot = new PredictionBot();

// Обработка сигналов завершения
process.on('SIGTERM', async () => {
    console.log('📞 Получен SIGTERM');
    await bot.shutdown();
});

process.on('SIGINT', async () => {
    console.log('📞 Получен SIGINT (Ctrl+C)');
    await bot.shutdown();
});

process.on('uncaughtException', (error) => {
    console.error('💥 Необработанное исключение:', error);
    bot.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Необработанное отклонение промиса:', reason);
    console.error('🔍 Promise:', promise);
    bot.shutdown();
});
