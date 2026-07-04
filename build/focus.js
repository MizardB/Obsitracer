"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentFocus = void 0;
exports.startFocusServer = startFocusServer;
const ws_1 = require("ws");
const http_1 = __importDefault(require("http"));
exports.currentFocus = {
    vault_name: null,
    vault_absolute_path: null,
    active_file: null,
    cursor_line: null,
    selected_text: null,
    pending_instructions: [],
    timestamp: null
};
function startFocusServer(port = 12121) {
    // 1. Creamos un servidor HTTP básico para health checks y servir a WebSocket
    const server = http_1.default.createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', message: 'Obsidian Copilot MCP is running' }));
            return;
        }
        res.writeHead(404);
        res.end('Not found');
    });
    // 2. Acoplamos WebSocket al servidor HTTP
    const wss = new ws_1.WebSocketServer({ server });
    wss.on('connection', (ws) => {
        console.error(`📡 [Focus Server] ¡Plugin de Obsidian conectado vía WebSocket!`);
        // Handshake inicial
        ws.send(JSON.stringify({ type: 'handshake', message: 'Connected to MCP Server' }));
        ws.on('message', (message) => {
            try {
                const parsed = JSON.parse(message.toString());
                // Asumimos que el payload que llega es el de "Radar"
                if (parsed.environment) {
                    exports.currentFocus.vault_name = parsed.environment.vault_name || null;
                    exports.currentFocus.vault_absolute_path = parsed.environment.vault_absolute_path || null;
                }
                if (parsed.focus) {
                    exports.currentFocus.active_file = parsed.focus.active_file || null;
                    exports.currentFocus.cursor_line = parsed.focus.cursor_line || null;
                    exports.currentFocus.selected_text = parsed.focus.selected_text || null;
                }
                exports.currentFocus.pending_instructions = parsed.pending_instructions || [];
                exports.currentFocus.timestamp = new Date().toISOString();
            }
            catch (e) {
                console.error(`📡 [Focus Server] Error parseando payload de Obsidian:`, e);
            }
        });
        ws.on('close', () => {
            console.error(`📡 [Focus Server] Plugin de Obsidian desconectado.`);
        });
    });
    // Escribimos el puerto en un archivo conocido para que el plugin lo lea
    const writePortToDiscoveryFile = async (assignedPort) => {
        const os = await import('os');
        const fs = await import('fs/promises');
        const path = await import('path');
        const discoveryFile = path.join(os.homedir(), '.obsidian_copilot_port.json');
        await fs.writeFile(discoveryFile, JSON.stringify({ port: assignedPort, timestamp: new Date().toISOString() }));
        console.error(`📡 [Focus Server] Puerto de descubrimiento guardado en ${discoveryFile}`);
    };
    server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            console.error(`📡 [Focus Server] Puerto ${port} en uso. Intentando con ${port + 1}...`);
            setTimeout(() => {
                server.close();
                server.listen(port + 1);
            }, 1000);
        }
        else {
            console.error(`📡 [Focus Server] Error: ${e.message}`);
        }
    });
    server.on('listening', () => {
        const address = server.address();
        const assignedPort = typeof address === 'string' ? port : address?.port || port;
        console.error(`📡 [Focus Server] Escuchando conexiones de Obsidian en ws://localhost:${assignedPort}...`);
        writePortToDiscoveryFile(assignedPort).catch(console.error);
    });
    server.listen(port);
}
