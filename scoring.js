class ScoringSystem {
    /**
     * Вычисляет баллы за прогноз
     * @param {number} predA - Прогноз голов команды A
     * @param {number} predB - Прогноз голов команды B  
     * @param {number} resultA - Реальный результат команды A
     * @param {number} resultB - Реальный результат команды B
     * @returns {number} - Количество баллов (0, 1, 2 или 3)
     */
    static calculatePoints(predA, predB, resultA, resultB) {
        // Точный результат - 3 балла
        if (predA === resultA && predB === resultB) {
            return 3;
        }

        const predOutcome = this.getOutcome(predA, predB);
        const resultOutcome = this.getOutcome(resultA, resultB);
        
        // Если исход не угадан, то 0 баллов
        if (predOutcome !== resultOutcome) {
            return 0;
        }

        // Разница мячей и исход - 2 балла
        const predDiff = predA - predB;
        const resultDiff = resultA - resultB;
        
        if (predDiff === resultDiff) {
            return 2;
        }

        // Только исход - 1 балл
        return 1;
    }

    /**
     * Определяет исход матча
     * @param {number} goalsA - Голы команды A
     * @param {number} goalsB - Голы команды B
     * @returns {string} - 'win_a', 'draw', 'win_b'
     */
    static getOutcome(goalsA, goalsB) {
        if (goalsA > goalsB) return 'win_a';
        if (goalsA < goalsB) return 'win_b';
        return 'draw';
    }

    /**
     * Получает текстовое описание результата
     * @param {number} points - Количество баллов
     * @returns {string} - Описание результата
     */
    static getPointsDescription(points) {
        switch (points) {
            case 3:
                return '🎯 Точный результат (+3 балла)';
            case 2:
                return '🎲 Разница мячей и исход (+2 балла)';
            case 1:
                return '⚽ Угаданный исход (+1 балл)';
            case 0:
            default:
                return '❌ Мимо (+0 баллов)';
        }
    }

    /**
     * Получает эмодзи для отображения результата
     * @param {number} points - Количество баллов
     * @returns {string} - Эмодзи
     */
    static getPointsEmoji(points) {
        switch (points) {
            case 3: return '🎯';
            case 2: return '🎲';
            case 1: return '⚽';
            case 0:
            default: return '❌';
        }
    }

    /**
     * Форматирует отображение прогноза
     * @param {number} predA - Прогноз голов команды A
     * @param {number} predB - Прогноз голов команды B
     * @returns {string} - Отформатированный прогноз
     */
    static formatPrediction(predA, predB) {
        return `${predA}:${predB}`;
    }

    /**
     * Форматирует отображение результата матча
     * @param {number} resultA - Результат команды A
     * @param {number} resultB - Результат команды B
     * @returns {string} - Отформатированный результат
     */
    static formatResult(resultA, resultB) {
        return `${resultA}:${resultB}`;
    }

    /**
     * Проверяет корректность прогноза
     * @param {number} predA - Прогноз голов команды A
     * @param {number} predB - Прогноз голов команды B
     * @returns {boolean} - true если прогноз корректен
     */
    static isValidPrediction(predA, predB) {
        return Number.isInteger(predA) && 
               Number.isInteger(predB) && 
               predA >= 0 && 
               predB >= 0 && 
               predA <= 20 && 
               predB <= 20; // Разумные ограничения
    }
}

module.exports = ScoringSystem;
