import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const STATE_FILE = path.join(os.homedir(), '.obsidian_estado_actual.json');
const MAX_EVENTS = 20;

interface CrudEvent {
    type: 'create' | 'modify' | 'delete';
    path: string;
    timestamp: string;
}

let recentEvents: CrudEvent[] = [];
let debounceTimer: NodeJS.Timeout | null = null;

async function writeState() {
    try {
        const summary = {
            lastUpdate: new Date().toISOString(),
            events: recentEvents
        };
        await fs.writeFile(STATE_FILE, JSON.stringify(summary, null, 2));
    } catch (err) {
        console.error("Error al escribir el estado de Obsidian", err);
    }
}

function queueWrite() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(writeState, 2000); // 2 segundos de debounce
}

export function startWatcher(vaultPath: string) {
    console.error(`[Watcher] Escuchando cambios en ${vaultPath}...`);
    
    const watcher = chokidar.watch(vaultPath, {
        ignored: /(^|[\/\\])\../, // Ignora archivos/carpetas ocultas como .obsidian
        persistent: true,
        ignoreInitial: true,
    });

    let pendingBatch: CrudEvent[] = [];

    const flushBatch = () => {
        if (pendingBatch.length === 0) return;

        if (pendingBatch.length > 5) {
            // Agrupar cambios masivos
            recentEvents.unshift({
                type: 'modify',
                path: `${pendingBatch.length} archivos modificados masivamente`,
                timestamp: new Date().toISOString()
            });
        } else {
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

    let batchTimer: NodeJS.Timeout | null = null;

    const addEvent = (type: CrudEvent['type'], filePath: string) => {
        const relativePath = path.relative(vaultPath, filePath);
        pendingBatch.push({ type, path: relativePath, timestamp: new Date().toISOString() });
        
        if (batchTimer) clearTimeout(batchTimer);
        batchTimer = setTimeout(flushBatch, 2000); // 2 segundos de ventana para agrupar
    };

    watcher
        .on('add', filePath => addEvent('create', filePath))
        .on('change', filePath => addEvent('modify', filePath))
        .on('unlink', filePath => addEvent('delete', filePath));
        
    return watcher;
}

export function getRecentEvents(): CrudEvent[] {
    return recentEvents;
}
