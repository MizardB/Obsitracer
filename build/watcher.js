"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWatcher = startWatcher;
exports.getRecentEvents = getRecentEvents;
const chokidar_1 = __importDefault(require("chokidar"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const STATE_FILE = path_1.default.join(os_1.default.homedir(), '.obsidian_estado_actual.json');
const MAX_EVENTS = 20;
let recentEvents = [];
let debounceTimer = null;
async function writeState() {
    try {
        const summary = {
            lastUpdate: new Date().toISOString(),
            events: recentEvents
        };
        await promises_1.default.writeFile(STATE_FILE, JSON.stringify(summary, null, 2));
    }
    catch (err) {
        console.error("Error al escribir el estado de Obsidian", err);
    }
}
function queueWrite() {
    if (debounceTimer)
        clearTimeout(debounceTimer);
    debounceTimer = setTimeout(writeState, 2000); // 2 segundos de debounce
}
function startWatcher(vaultPath) {
    console.error(`[Watcher] Escuchando cambios en ${vaultPath}...`);
    const watcher = chokidar_1.default.watch(vaultPath, {
        ignored: /(^|[\/\\])\../, // Ignora archivos/carpetas ocultas como .obsidian
        persistent: true,
        ignoreInitial: true,
    });
    let pendingBatch = [];
    const flushBatch = () => {
        if (pendingBatch.length === 0)
            return;
        if (pendingBatch.length > 5) {
            // Agrupar cambios masivos
            recentEvents.unshift({
                type: 'modify',
                path: `${pendingBatch.length} archivos modificados masivamente`,
                timestamp: new Date().toISOString()
            });
        }
        else {
            // Añadir individualmente
            for (const ev of pendingBatch) {
                recentEvents.unshift(ev);
            }
        }
        pendingBatch = [];
        // Mantenemos solo los últimos MAX_EVENTS
        if (recentEvents.length > MAX_EVENTS) {
            recentEvents.length = MAX_EVENTS;
        }
        writeState();
    };
    let batchTimer = null;
    const addEvent = (type, filePath) => {
        const relativePath = path_1.default.relative(vaultPath, filePath);
        pendingBatch.push({ type, path: relativePath, timestamp: new Date().toISOString() });
        if (batchTimer)
            clearTimeout(batchTimer);
        batchTimer = setTimeout(flushBatch, 2000); // 2 segundos de ventana para agrupar
    };
    watcher
        .on('add', filePath => addEvent('create', filePath))
        .on('change', filePath => addEvent('modify', filePath))
        .on('unlink', filePath => addEvent('delete', filePath));
    return watcher;
}
function getRecentEvents() {
    return recentEvents;
}
