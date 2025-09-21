#!/usr/bin/env node

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PID_FILE = path.join(__dirname, 'bot.pid');

function getPid() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
            // Проверяем, существует ли процесс
            try {
                process.kill(pid, 0);
                return pid;
            } catch (e) {
                // Процесс не существует, удаляем старый PID файл
                fs.unlinkSync(PID_FILE);
                return null;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

function savePid(pid) {
    fs.writeFileSync(PID_FILE, pid.toString());
}

function removePidFile() {
    if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
    }
}

function startBot(port) {
    const existingPid = getPid();
    if (existingPid) {
        console.log(`🤖 Бот уже запущен (PID: ${existingPid})`);
        return;
    }

    console.log('🚀 Запускаю бота...');
    
    // Настройка переменных окружения
    const env = { ...process.env };
    if (port) {
        env.PORT = port;
        console.log(`🌐 Установлен порт: ${port}`);
    }
    
    const botProcess = spawn('node', ['index.js'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env
    });

    savePid(botProcess.pid);
    console.log(`✅ Бот запущен (PID: ${botProcess.pid})`);
    
    // Показываем вывод в течение первых 3 секунд
    let outputShown = false;
    botProcess.stdout.on('data', (data) => {
        if (!outputShown) {
            console.log('📝 Вывод бота:');
            outputShown = true;
        }
        console.log(data.toString());
    });

    botProcess.stderr.on('data', (data) => {
        if (!outputShown) {
            console.log('📝 Вывод бота:');
            outputShown = true;
        }
        console.error(data.toString());
    });

    // Отключаемся от процесса через 3 секунды
    setTimeout(() => {
        botProcess.unref();
        console.log('🔌 Отключение от процесса бота. Бот продолжит работу в фоне.');
    }, 3000);
}

function stopBot() {
    const pid = getPid();
    if (!pid) {
        console.log('❌ Бот не запущен');
        return;
    }

    console.log(`🛑 Останавливаю бота (PID: ${pid})...`);
    try {
        process.kill(pid, 'SIGTERM');
        removePidFile();
        console.log('✅ Бот остановлен');
    } catch (e) {
        console.error('❌ Ошибка при остановке бота:', e.message);
        removePidFile(); // Удаляем PID файл в любом случае
    }
}

function restartBot(port) {
    console.log('🔄 Перезапуск бота...');
    stopBot();
    setTimeout(() => {
        startBot(port);
    }, 2000);
}

function statusBot() {
    const pid = getPid();
    if (pid) {
        console.log(`🟢 Бот запущен (PID: ${pid})`);
    } else {
        console.log('🔴 Бот не запущен');
    }
}

// Обработка аргументов командной строки
const command = process.argv[2];
const port = process.argv[3]; // Опциональный порт

switch (command) {
    case 'start':
        startBot(port);
        break;
    case 'stop':
        stopBot();
        break;
    case 'restart':
        restartBot(port);
        break;
    case 'status':
        statusBot();
        break;
    default:
        console.log('🤖 Управление ботом прогнозов');
        console.log('');
        console.log('Доступные команды:');
        console.log('  node bot-control.js start [port]    - Запустить бота (опционально с портом)');
        console.log('  node bot-control.js stop            - Остановить бота');
        console.log('  node bot-control.js restart [port]  - Перезапустить бота (опционально с портом)');
        console.log('  node bot-control.js status          - Проверить статус бота');
        console.log('');
        console.log('Примеры:');
        console.log('  node bot-control.js start 8080      - Запустить на порту 8080');
        console.log('  node bot-control.js restart 3001    - Перезапустить на порту 3001');
        console.log('');
        console.log('Или используйте npm команды:');
        console.log('  npm start         - Запустить бота');
        console.log('  npm run stop      - Остановить бота');
        console.log('  npm run restart   - Перезапустить бота');
        console.log('  npm run status    - Проверить статус бота');
        console.log('  npm run dev       - Запустить в режиме разработки');
        console.log('  npm run direct    - Запустить напрямую');
        break;
}
