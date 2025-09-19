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

function startBot() {
    const existingPid = getPid();
    if (existingPid) {
        console.log(`🤖 Бот уже запущен (PID: ${existingPid})`);
        return;
    }

    console.log('🚀 Запускаю бота...');
    const botProcess = spawn('node', ['index.js'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
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

function restartBot() {
    console.log('🔄 Перезапуск бота...');
    stopBot();
    setTimeout(() => {
        startBot();
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

switch (command) {
    case 'start':
        startBot();
        break;
    case 'stop':
        stopBot();
        break;
    case 'restart':
        restartBot();
        break;
    case 'status':
        statusBot();
        break;
    default:
        console.log('🤖 Управление ботом прогнозов');
        console.log('');
        console.log('Доступные команды:');
        console.log('  node bot-control.js start    - Запустить бота');
        console.log('  node bot-control.js stop     - Остановить бота');
        console.log('  node bot-control.js restart  - Перезапустить бота');
        console.log('  node bot-control.js status   - Проверить статус бота');
        console.log('');
        console.log('Или используйте npm команды:');
        console.log('  npm start     - Запустить бота');
        console.log('  npm run stop  - Остановить бота');
        console.log('  npm run restart - Перезапустить бота');
        console.log('  npm run status  - Проверить статус бота');
        break;
}
