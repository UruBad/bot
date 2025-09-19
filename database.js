const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'bot.db'));
        this.init();
    }

    init() {
        // Таблица пользователей
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                telegram_id INTEGER UNIQUE,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                total_points INTEGER DEFAULT 0,
                current_season INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица матчей
        this.db.run(`
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_a TEXT NOT NULL,
                team_b TEXT NOT NULL,
                match_date DATETIME NOT NULL,
                result_a INTEGER,
                result_b INTEGER,
                is_finished INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица прогнозов
        this.db.run(`
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                match_id INTEGER,
                prediction_a INTEGER NOT NULL,
                prediction_b INTEGER NOT NULL,
                points_earned INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (telegram_id),
                FOREIGN KEY (match_id) REFERENCES matches (id),
                UNIQUE(user_id, match_id)
            )
        `);

        // Таблица истории ручных изменений баллов
        this.db.run(`
            CREATE TABLE IF NOT EXISTS points_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                admin_id INTEGER,
                points_change INTEGER NOT NULL,
                reason TEXT,
                action_type TEXT NOT NULL, -- 'add' или 'set'
                old_total INTEGER,
                new_total INTEGER,
                season INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (telegram_id),
                FOREIGN KEY (admin_id) REFERENCES users (telegram_id)
            )
        `);

        // Таблица сезонов
        this.db.run(`
            CREATE TABLE IF NOT EXISTS seasons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                season_number INTEGER UNIQUE,
                name TEXT,
                start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_date DATETIME,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица архива результатов сезонов
        this.db.run(`
            CREATE TABLE IF NOT EXISTS season_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                season_number INTEGER,
                user_id INTEGER,
                final_points INTEGER,
                position INTEGER,
                total_predictions INTEGER DEFAULT 0,
                exact_predictions INTEGER DEFAULT 0,
                close_predictions INTEGER DEFAULT 0,
                outcome_predictions INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (telegram_id)
            )
        `);

        // Таблица администраторов
        this.db.run(`
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                is_super_admin INTEGER DEFAULT 0,
                added_by INTEGER,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active INTEGER DEFAULT 1,
                FOREIGN KEY (added_by) REFERENCES admins (user_id)
            )
        `);

        // Таблица уведомлений о матчах
        this.db.run(`
            CREATE TABLE IF NOT EXISTS match_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL,
                notification_sent DATETIME DEFAULT CURRENT_TIMESTAMP,
                users_notified INTEGER DEFAULT 0,
                FOREIGN KEY (match_id) REFERENCES matches (id),
                UNIQUE(match_id)
            )
        `);

        // Создаем первый сезон если его нет
        this.db.run(`
            INSERT OR IGNORE INTO seasons (season_number, name, is_active) 
            VALUES (1, 'Сезон 1', 1)
        `);
    }

    // Методы для работы с пользователями
    async addUser(telegramId, username, firstName, lastName) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT OR IGNORE INTO users (telegram_id, username, first_name, last_name) 
                 VALUES (?, ?, ?, ?)`,
                [telegramId, username, firstName, lastName],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getUser(telegramId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE telegram_id = ?',
                [telegramId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async updateUserPoints(telegramId, points) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE users SET total_points = total_points + ? WHERE telegram_id = ?',
                [points, telegramId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    // Методы для работы с матчами
    async addMatch(teamA, teamB, matchDate) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO matches (team_a, team_b, match_date) VALUES (?, ?, ?)',
                [teamA, teamB, matchDate],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getActiveMatches() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM matches WHERE is_finished = 0 ORDER BY match_date ASC',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async getMatch(matchId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM matches WHERE id = ?',
                [matchId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async finishMatch(matchId, resultA, resultB) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE matches SET result_a = ?, result_b = ?, is_finished = 1 WHERE id = ?',
                [resultA, resultB, matchId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    // Методы для работы с прогнозами
    async addPrediction(userId, matchId, predictionA, predictionB) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT OR REPLACE INTO predictions (user_id, match_id, prediction_a, prediction_b) 
                 VALUES (?, ?, ?, ?)`,
                [userId, matchId, predictionA, predictionB],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getPrediction(userId, matchId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM predictions WHERE user_id = ? AND match_id = ?',
                [userId, matchId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async getPredictionsForMatch(matchId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT p.*, u.username, u.first_name, u.last_name 
                 FROM predictions p 
                 JOIN users u ON p.user_id = u.telegram_id 
                 WHERE p.match_id = ?`,
                [matchId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async updatePredictionPoints(userId, matchId, points) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE predictions SET points_earned = ? WHERE user_id = ? AND match_id = ?',
                [points, userId, matchId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    // Таблица лидеров
    async getLeaderboard(limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT telegram_id, username, first_name, last_name, total_points 
                 FROM users 
                 ORDER BY total_points DESC 
                 LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    // Статистика пользователя
    async getUserStats(telegramId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT 
                    COUNT(*) as total_predictions,
                    SUM(CASE WHEN points_earned = 3 THEN 1 ELSE 0 END) as exact_predictions,
                    SUM(CASE WHEN points_earned = 2 THEN 1 ELSE 0 END) as close_predictions,
                    SUM(CASE WHEN points_earned = 1 THEN 1 ELSE 0 END) as outcome_predictions,
                    SUM(CASE WHEN points_earned = 0 THEN 1 ELSE 0 END) as incorrect_predictions,
                    SUM(points_earned) as total_points_earned
                 FROM predictions 
                 WHERE user_id = ?`,
                [telegramId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    // Методы для работы с администраторами
    async addAdmin(userId, username, firstName, lastName, isSuperAdmin = false, addedBy = null) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT OR IGNORE INTO admins (user_id, username, first_name, last_name, is_super_admin, added_by) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, username, firstName, lastName, isSuperAdmin ? 1 : 0, addedBy],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async isAdmin(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM admins WHERE user_id = ? AND is_active = 1',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }

    async isSuperAdmin(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM admins WHERE user_id = ? AND is_super_admin = 1 AND is_active = 1',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }

    async getAdmins() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM admins WHERE is_active = 1 ORDER BY is_super_admin DESC, added_at ASC',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async removeAdmin(userId, removedBy) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE admins SET is_active = 0 WHERE user_id = ?',
                [userId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    async getAdminInfo(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM admins WHERE user_id = ? AND is_active = 1',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    // Методы для работы с сезонами
    async getCurrentSeason() {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM seasons WHERE is_active = 1 ORDER BY season_number DESC LIMIT 1',
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async createNewSeason(name = null, adminId) {
        return new Promise(async (resolve, reject) => {
            try {
                // Получаем текущий сезон
                const currentSeason = await this.getCurrentSeason();
                if (!currentSeason) {
                    reject(new Error('Активный сезон не найден'));
                    return;
                }

                const newSeasonNumber = currentSeason.season_number + 1;
                const seasonName = name || `Сезон ${newSeasonNumber}`;

                // Сохраняем результаты текущего сезона
                await this.archiveCurrentSeason(currentSeason.season_number);

                // Закрываем текущий сезон
                this.db.run(
                    'UPDATE seasons SET is_active = 0, end_date = CURRENT_TIMESTAMP WHERE season_number = ?',
                    [currentSeason.season_number],
                    (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        // Создаем новый сезон
                        this.db.run(
                            'INSERT INTO seasons (season_number, name, is_active) VALUES (?, ?, 1)',
                            [newSeasonNumber, seasonName],
                            (err) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }

                                // Обнуляем баллы всех пользователей и обновляем их сезон
                                this.db.run(
                                    'UPDATE users SET total_points = 0, current_season = ?',
                                    [newSeasonNumber],
                                    function(err) {
                                        if (err) reject(err);
                                        else resolve({ 
                                            newSeasonNumber, 
                                            seasonName, 
                                            usersReset: this.changes 
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    async archiveCurrentSeason(seasonNumber) {
        return new Promise((resolve, reject) => {
            // Получаем топ пользователей текущего сезона с их статистикой
            this.db.all(`
                SELECT 
                    u.telegram_id,
                    u.total_points,
                    COUNT(p.id) as total_predictions,
                    SUM(CASE WHEN p.points_earned = 3 THEN 1 ELSE 0 END) as exact_predictions,
                    SUM(CASE WHEN p.points_earned = 2 THEN 1 ELSE 0 END) as close_predictions,
                    SUM(CASE WHEN p.points_earned = 1 THEN 1 ELSE 0 END) as outcome_predictions,
                    ROW_NUMBER() OVER (ORDER BY u.total_points DESC, u.telegram_id) as position
                FROM users u
                LEFT JOIN predictions p ON u.telegram_id = p.user_id AND p.points_earned > 0
                WHERE u.current_season = ?
                GROUP BY u.telegram_id, u.total_points
                ORDER BY u.total_points DESC, u.telegram_id
            `, [seasonNumber], (err, users) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (users.length === 0) {
                    resolve([]);
                    return;
                }

                // Сохраняем результаты в архив
                const stmt = this.db.prepare(`
                    INSERT INTO season_results 
                    (season_number, user_id, final_points, position, total_predictions, 
                     exact_predictions, close_predictions, outcome_predictions)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                let completed = 0;
                users.forEach(user => {
                    stmt.run([
                        seasonNumber,
                        user.telegram_id,
                        user.total_points,
                        user.position,
                        user.total_predictions || 0,
                        user.exact_predictions || 0,
                        user.close_predictions || 0,
                        user.outcome_predictions || 0
                    ], (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        completed++;
                        if (completed === users.length) {
                            stmt.finalize();
                            resolve(users);
                        }
                    });
                });
            });
        });
    }

    async getSeasonHistory(limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM seasons ORDER BY season_number DESC LIMIT ?',
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async getSeasonResults(seasonNumber, limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT sr.*, u.username, u.first_name, u.last_name
                FROM season_results sr
                JOIN users u ON sr.user_id = u.telegram_id
                WHERE sr.season_number = ?
                ORDER BY sr.position ASC
                LIMIT ?
            `, [seasonNumber, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getUserSeasonStats(telegramId, seasonNumber = null) {
        return new Promise(async (resolve, reject) => {
            try {
                let season = seasonNumber;
                if (!season) {
                    const currentSeason = await this.getCurrentSeason();
                    season = currentSeason ? currentSeason.season_number : 1;
                }

                // Если запрашивается активный сезон
                const currentSeasonInfo = await this.getCurrentSeason();
                if (season === currentSeasonInfo.season_number) {
                    // Берем данные из основных таблиц
                    const stats = await this.getUserStats(telegramId);
                    const user = await this.getUser(telegramId);
                    resolve({
                        season_number: season,
                        final_points: user ? user.total_points : 0,
                        total_predictions: stats ? stats.total_predictions : 0,
                        exact_predictions: stats ? stats.exact_predictions : 0,
                        close_predictions: stats ? stats.close_predictions : 0,
                        outcome_predictions: stats ? stats.outcome_predictions : 0,
                        is_current: true
                    });
                } else {
                    // Берем данные из архива
                    this.db.get(`
                        SELECT * FROM season_results 
                        WHERE user_id = ? AND season_number = ?
                    `, [telegramId, season], (err, row) => {
                        if (err) reject(err);
                        else resolve(row ? { ...row, is_current: false } : null);
                    });
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    // Методы для ручного управления баллами
    async addPointsToUser(telegramId, points, adminId, reason = null) {
        return new Promise(async (resolve, reject) => {
            try {
                // Получаем текущие баллы
                const user = await this.getUser(telegramId);
                if (!user) {
                    reject(new Error('Пользователь не найден'));
                    return;
                }

                const oldTotal = user.total_points;
                const newTotal = oldTotal + points;

                // Обновляем баллы пользователя
                await this.updateUserPoints(telegramId, points);

                // Получаем текущий сезон
                const currentSeason = await this.getCurrentSeason();
                const seasonNumber = currentSeason ? currentSeason.season_number : 1;

                // Записываем в историю
                this.db.run(
                    `INSERT INTO points_history (user_id, admin_id, points_change, reason, action_type, old_total, new_total, season) 
                     VALUES (?, ?, ?, ?, 'add', ?, ?, ?)`,
                    [telegramId, adminId, points, reason, oldTotal, newTotal, seasonNumber],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ oldTotal, newTotal, change: points });
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    async setUserPoints(telegramId, points, adminId, reason = null) {
        return new Promise(async (resolve, reject) => {
            try {
                // Получаем текущие баллы
                const user = await this.getUser(telegramId);
                if (!user) {
                    reject(new Error('Пользователь не найден'));
                    return;
                }

                const oldTotal = user.total_points;
                const pointsChange = points - oldTotal;

                // Устанавливаем новые баллы
                this.db.run(
                    'UPDATE users SET total_points = ? WHERE telegram_id = ?',
                    [points, telegramId],
                    (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        // Получаем текущий сезон и записываем в историю
                        this.getCurrentSeason().then(currentSeason => {
                            const seasonNumber = currentSeason ? currentSeason.season_number : 1;
                            
                            this.db.run(
                                `INSERT INTO points_history (user_id, admin_id, points_change, reason, action_type, old_total, new_total, season) 
                                 VALUES (?, ?, ?, ?, 'set', ?, ?, ?)`,
                                [telegramId, adminId, pointsChange, reason, oldTotal, points, seasonNumber],
                                function(err) {
                                    if (err) reject(err);
                                    else resolve({ oldTotal, newTotal: points, change: pointsChange });
                                }
                            );
                        }).catch(reject);
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    async getPointsHistory(telegramId = null, limit = 20) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT ph.*, 
                       u1.username as user_username, u1.first_name as user_first_name,
                       u2.username as admin_username, u2.first_name as admin_first_name
                FROM points_history ph
                JOIN users u1 ON ph.user_id = u1.telegram_id
                JOIN users u2 ON ph.admin_id = u2.telegram_id
            `;
            let params = [];

            if (telegramId) {
                query += ' WHERE ph.user_id = ?';
                params.push(telegramId);
            }

            query += ' ORDER BY ph.created_at DESC LIMIT ?';
            params.push(limit);

            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async searchUserByUsernameOrName(searchTerm) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT telegram_id, username, first_name, last_name, total_points 
                 FROM users 
                 WHERE username LIKE ? OR first_name LIKE ? OR last_name LIKE ?
                 ORDER BY total_points DESC`,
                [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    // Методы для работы с уведомлениями о матчах
    async getMatchesForNotification() {
        return new Promise((resolve, reject) => {
            const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            
            this.db.all(`
                SELECT m.* 
                FROM matches m
                LEFT JOIN match_notifications mn ON m.id = mn.match_id
                WHERE m.is_finished = 0 
                AND m.match_date > ? 
                AND m.match_date <= ?
                AND mn.match_id IS NULL
                ORDER BY m.match_date ASC
            `, [fiveMinutesFromNow, oneHourFromNow], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async markMatchNotificationSent(matchId, usersNotified) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR REPLACE INTO match_notifications (match_id, users_notified) VALUES (?, ?)',
                [matchId, usersNotified],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async isMatchNotificationSent(matchId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM match_notifications WHERE match_id = ?',
                [matchId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }

    async getAllUsers() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT telegram_id, username, first_name FROM users ORDER BY telegram_id',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async getUsersWithoutPrediction(matchId) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT u.telegram_id, u.username, u.first_name 
                FROM users u
                LEFT JOIN predictions p ON u.telegram_id = p.user_id AND p.match_id = ?
                WHERE p.user_id IS NULL
                ORDER BY u.telegram_id
            `, [matchId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = Database;
