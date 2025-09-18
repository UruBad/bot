// Тесты системы подсчета баллов для футбольного бота
const ScoringSystem = require('./scoring');

console.log('🧪 Запуск тестов системы подсчета баллов\n');

// Цвета для консоли
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

// Счетчики тестов
let totalTests = 0;
let passedTests = 0;

// Функция для запуска одного теста
function runTest(testName, prediction, result, expectedPoints, description) {
    totalTests++;
    const [predA, predB] = prediction;
    const [resA, resB] = result;
    
    const actualPoints = ScoringSystem.calculatePoints(predA, predB, resA, resB);
    const isPass = actualPoints === expectedPoints;
    
    if (isPass) passedTests++;
    
    const status = isPass ? 
        `${colors.green}✅ ПРОЙДЕН${colors.reset}` : 
        `${colors.red}❌ ПРОВАЛЕН${colors.reset}`;
    
    console.log(`${colors.bold}${totalTests}. ${testName}${colors.reset}`);
    console.log(`   Прогноз: ${colors.blue}${predA}:${predB}${colors.reset} | Результат: ${colors.blue}${resA}:${resB}${colors.reset}`);
    console.log(`   Ожидаемо: ${expectedPoints} балл${getPointsWord(expectedPoints)} | Получено: ${actualPoints} балл${getPointsWord(actualPoints)}`);
    console.log(`   ${status} - ${description}`);
    console.log(`   ${ScoringSystem.getPointsDescription(actualPoints)}\n`);
    
    return isPass;
}

// Группа тестов: Точный результат (3 балла)
console.log(`${colors.yellow}🎯 ГРУППА 1: Точный результат (3 балла)${colors.reset}\n`);

runTest(
    'Точный результат - обычный счет',
    [2, 1], [2, 1], 3,
    'Полное совпадение прогноза и результата'
);

runTest(
    'Точный результат - ничья',
    [1, 1], [1, 1], 3,
    'Точное угадывание ничейного счета'
);

runTest(
    'Точный результат - крупный счет',
    [4, 0], [4, 0], 3,
    'Точное угадывание разгромного счета'
);

runTest(
    'Точный результат - нулевая ничья',
    [0, 0], [0, 0], 3,
    'Точное угадывание безголевой ничьей'
);

// Группа тестов: Разница мячей и исход (2 балла)
console.log(`${colors.yellow}🎲 ГРУППА 2: Разница мячей и исход (2 балла)${colors.reset}\n`);

runTest(
    'Разница +2 и победа первой команды',
    [3, 1], [2, 0], 2,
    'Угадана разница в 2 мяча и победа команды A'
);

runTest(
    'Разница +1 и победа первой команды',
    [2, 1], [3, 2], 2,
    'Угадана разница в 1 мяч и победа команды A'
);

runTest(
    'Разница -1 и победа второй команды',
    [0, 1], [1, 2], 2,
    'Угадана разница в 1 мяч и победа команды B'
);

runTest(
    'Разница 0 и ничья',
    [1, 1], [2, 2], 2,
    'Угадана нулевая разница и ничья'
);

runTest(
    'Разница 0 и ничья (другие счета)',
    [0, 0], [3, 3], 2,
    'Угадана нулевая разница и ничья с другими счетами'
);

runTest(
    'Разница +3 и победа первой команды',
    [4, 1], [3, 0], 2,
    'Угадана разница в 3 мяча и победа команды A'
);

// Группа тестов: Только исход (1 балл)
console.log(`${colors.yellow}⚽ ГРУППА 3: Только исход (1 балл)${colors.reset}\n`);

runTest(
    'Только победа первой команды',
    [2, 1], [4, 2], 1,
    'Угадана победа команды A, но разная разница (+1 vs +2)'
);

runTest(
    'Разница -2 и победа второй команды',
    [0, 2], [1, 3], 2,
    'Угадана разница -2 и победа команды B'
);

// Исправим предыдущий тест
runTest(
    'Только победа второй команды',
    [0, 1], [1, 3], 1,
    'Угадана победа команды B, но разная разница (-1 vs -2)'
);

runTest(
    'Разница 0 и ничья (одинаковые разности)',
    [2, 2], [1, 1], 2,
    'Угадана разность 0 и ничья'
);

// Ждите, это тоже неправильно. Исправим:
runTest(
    'Разница 0 и ничья (другие счета)',
    [1, 1], [0, 0], 2,
    'Угадана разность 0 и ничья (все ничьи имеют разность 0)'
);

// Группа тестов: Промах (0 баллов)
console.log(`${colors.yellow}❌ ГРУППА 4: Полный промах (0 баллов)${colors.reset}\n`);

runTest(
    'Ничья vs Победа A',
    [1, 1], [2, 0], 0,
    'Прогноз ничьи, а победила команда A'
);

runTest(
    'Победа A vs Победа B',
    [2, 0], [0, 3], 0,
    'Прогноз победы A, а победила команда B'
);

runTest(
    'Победа B vs Ничья',
    [0, 2], [1, 1], 0,
    'Прогноз победы B, а получилась ничья'
);

runTest(
    'Противоположные результаты',
    [3, 0], [0, 4], 0,
    'Полностью противоположные результаты'
);

// Группа тестов: Граничные случаи
console.log(`${colors.yellow}🔬 ГРУППА 5: Граничные случаи${colors.reset}\n`);

runTest(
    'Максимально возможный счет',
    [20, 20], [20, 20], 3,
    'Проверка максимальных значений (точный результат)'
);

runTest(
    'Минимальный счет',
    [0, 0], [0, 0], 3,
    'Проверка минимальных значений (точный результат)'
);

runTest(
    'Большая разница мячей',
    [10, 0], [15, 5], 2,
    'Угадана разность +10 и победа при больших счетах'
);

// Группа тестов: Реальные футбольные сценарии
console.log(`${colors.yellow}⚽ ГРУППА 6: Реальные футбольные сценарии${colors.reset}\n`);

runTest(
    'Классический дерби',
    [1, 0], [1, 0], 3,
    'Точный прогноз минимальной победы'
);

runTest(
    'Результативная ничья',
    [2, 2], [3, 3], 2,
    'Угадана разница и исход при результативной игре'
);

runTest(
    'Сенсационная победа аутсайдера',
    [0, 1], [0, 2], 1,
    'Угадан только исход при неожиданном результате'
);

runTest(
    'Разгром фаворитом',
    [3, 0], [4, 1], 2,
    'Угадана разность +3 и победа при разгромных счетах'
);

runTest(
    'Неожиданная ничья',
    [1, 1], [0, 0], 2,
    'Угадана разность 0 и ничья'
);

runTest(
    'Реальный случай - только исход победы',
    [2, 0], [3, 1], 2,
    'Угадана разность +2 и победа команды A'
);

// Исправим предыдущий тест
runTest(
    'Драматичная ничья',
    [1, 1], [2, 2], 2,
    'Угадана разность 0 и ничья в драматичном матче'
);

// Группа тестов: Проверка функций валидации
console.log(`${colors.yellow}🔍 ГРУППА 7: Тесты валидации${colors.reset}\n`);

function testValidation(predA, predB, expectedValid, description) {
    totalTests++;
    const isValid = ScoringSystem.isValidPrediction(predA, predB);
    const isPass = isValid === expectedValid;
    
    if (isPass) passedTests++;
    
    const status = isPass ? 
        `${colors.green}✅ ПРОЙДЕН${colors.reset}` : 
        `${colors.red}❌ ПРОВАЛЕН${colors.reset}`;
    
    console.log(`${colors.bold}${totalTests}. Валидация: ${predA}:${predB}${colors.reset}`);
    console.log(`   Ожидаемо: ${expectedValid ? 'валидно' : 'невалидно'} | Получено: ${isValid ? 'валидно' : 'невалидно'}`);
    console.log(`   ${status} - ${description}\n`);
    
    return isPass;
}

testValidation(2, 1, true, 'Обычный корректный прогноз');
testValidation(0, 0, true, 'Нулевой счет (валидно)');
testValidation(20, 20, true, 'Максимальный допустимый счет');
testValidation(-1, 0, false, 'Отрицательное значение (невалидно)');
testValidation(21, 0, false, 'Превышение максимума (невалидно)');
testValidation(1.5, 2, false, 'Дробное число (невалидно)');

// Группа тестов: Проверка вспомогательных функций
console.log(`${colors.yellow}🛠 ГРУППА 8: Вспомогательные функции${colors.reset}\n`);

function testOutcome(goalsA, goalsB, expectedOutcome, description) {
    totalTests++;
    const outcome = ScoringSystem.getOutcome(goalsA, goalsB);
    const isPass = outcome === expectedOutcome;
    
    if (isPass) passedTests++;
    
    const status = isPass ? 
        `${colors.green}✅ ПРОЙДЕН${colors.reset}` : 
        `${colors.red}❌ ПРОВАЛЕН${colors.reset}`;
    
    console.log(`${colors.bold}${totalTests}. Исход ${goalsA}:${goalsB}${colors.reset}`);
    console.log(`   Ожидаемо: ${expectedOutcome} | Получено: ${outcome}`);
    console.log(`   ${status} - ${description}\n`);
    
    return isPass;
}

testOutcome(2, 1, 'win_a', 'Победа первой команды');
testOutcome(0, 3, 'win_b', 'Победа второй команды');
testOutcome(1, 1, 'draw', 'Ничья');
testOutcome(0, 0, 'draw', 'Безголевая ничья');

// Подведение итогов
console.log(`${colors.bold}${colors.blue}🏁 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ${colors.reset}\n`);
console.log(`Всего тестов: ${colors.bold}${totalTests}${colors.reset}`);
console.log(`Пройдено: ${colors.green}${colors.bold}${passedTests}${colors.reset}`);
console.log(`Провалено: ${colors.red}${colors.bold}${totalTests - passedTests}${colors.reset}`);

const successRate = ((passedTests / totalTests) * 100).toFixed(1);
console.log(`Успешность: ${colors.bold}${successRate}%${colors.reset}\n`);

if (passedTests === totalTests) {
    console.log(`${colors.green}${colors.bold}🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Система подсчета баллов работает корректно.${colors.reset}`);
} else {
    console.log(`${colors.red}${colors.bold}⚠️  ЕСТЬ ОШИБКИ! Требуется доработка системы.${colors.reset}`);
}

console.log('\n' + '='.repeat(60));
console.log(`${colors.blue}Система подсчета баллов протестирована${colors.reset}`);
console.log(`${colors.yellow}Для запуска: node tests.js${colors.reset}`);

// Вспомогательная функция для склонения слова "балл"
function getPointsWord(points) {
    const lastDigit = points % 10;
    const lastTwoDigits = points % 100;
    
    if (lastTwoDigits >= 10 && lastTwoDigits <= 20) {
        return 'ов';
    }
    
    if (lastDigit === 1) return '';
    if (lastDigit >= 2 && lastDigit <= 4) return 'а';
    return 'ов';
}
