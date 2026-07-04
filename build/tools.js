"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanInstructions = scanInstructions;
exports.resolveInstruction = resolveInstruction;
exports.getActiveContext = getActiveContext;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const focus_js_1 = require("./focus.js");
const watcher_js_1 = require("./watcher.js");
// Utilidad para buscar recursivamente archivos .md
async function getMarkdownFiles(dir) {
    let results = [];
    try {
        const list = await promises_1.default.readdir(dir, { withFileTypes: true });
        for (const file of list) {
            // Ignorar carpetas ocultas y dependencias
            if (file.name.startsWith('.') || file.name === 'node_modules' || file.name === 'obsidian-plugin')
                continue;
            const res = path_1.default.resolve(dir, file.name);
            if (file.isDirectory()) {
                results = results.concat(await getMarkdownFiles(res));
            }
            else if (file.name.endsWith('.md')) {
                results.push(res);
            }
        }
    }
    catch (e) {
        console.error(`Error leyendo directorio ${dir}:`, e);
    }
    return results;
}
async function scanInstructions(vaultPath) {
    const files = await getMarkdownFiles(vaultPath);
    const pending = [];
    for (const file of files) {
        const content = await promises_1.default.readFile(file, 'utf-8');
        const lines = content.split('\n');
        // Expresión regular global [\s\S]*? permite capturar bloques multilínea
        const matches = [...content.matchAll(/%%agy:\s*([\s\S]*?)\s*%%/g)];
        for (const match of matches) {
            if (match.index === undefined)
                continue;
            // Encontrar en qué línea empieza el comando contando los \n anteriores
            const lineIndex = content.substring(0, match.index).split('\n').length - 1;
            // Calcular cuántas líneas ocupa la instrucción para el snippet
            const instructionLines = match[0].split('\n').length;
            const endLineIndex = lineIndex + instructionLines - 1;
            // Generar snippet de contexto (hasta 2 líneas arriba y 2 abajo del bloque completo)
            const startIdx = Math.max(0, lineIndex - 2);
            const endIdx = Math.min(lines.length - 1, endLineIndex + 2);
            const context_snippet = lines.slice(startIdx, endIdx + 1).join('\n');
            pending.push({
                file: path_1.default.relative(vaultPath, file),
                line: lineIndex + 1,
                command: match[1].trim(),
                context_snippet: context_snippet
            });
        }
    }
    return pending;
}
async function resolveInstruction(vaultPath, relativeFilePath, targetCommand, replacement) {
    const filePath = path_1.default.join(vaultPath, relativeFilePath);
    let content = await promises_1.default.readFile(filePath, 'utf-8');
    // Escapar regex, pero volver a habilitar los espacios (\s+) de manera flexible 
    // para tolerar saltos de línea y tabulaciones idénticas semánticamente.
    const escapedCommand = targetCommand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const regex = new RegExp(`%%agy:\\s*${escapedCommand}\\s*%%`);
    if (!regex.test(content)) {
        throw new Error(`El comando en línea no se encontró en ${relativeFilePath}. Target: ${targetCommand}`);
    }
    // Reemplazo no destructivo (sólo la primera ocurrencia por seguridad)
    content = content.replace(regex, replacement);
    await promises_1.default.writeFile(filePath, content, 'utf-8');
    return {
        success: true,
        message: `Instrucción resuelta exitosamente en ${relativeFilePath}`
    };
}
function getActiveContext() {
    if (!focus_js_1.currentFocus.active_file) {
        return { message: "No hay información de foco activo todavía. Asegúrate de que el plugin de Obsidian Copilot Focus esté activado." };
    }
    // Devolvemos el foco actual junto con los movimientos recientes en el Vault
    return {
        environment: {
            vault_name: focus_js_1.currentFocus.vault_name,
            vault_absolute_path: focus_js_1.currentFocus.vault_absolute_path
        },
        focus: {
            active_file: focus_js_1.currentFocus.active_file,
            cursor_line: focus_js_1.currentFocus.cursor_line,
            selected_text: focus_js_1.currentFocus.selected_text
        },
        pending_instructions: focus_js_1.currentFocus.pending_instructions,
        recent_crud_summary: (0, watcher_js_1.getRecentEvents)(),
        timestamp: focus_js_1.currentFocus.timestamp
    };
}
