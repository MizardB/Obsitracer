import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { startWatcher } from "./watcher.js";
import { scanInstructions, resolveInstruction, getActiveContext } from "./tools.js";
import { startFocusServer } from "./focus.js";

// La bóveda a escuchar puede inyectarse por variables de entorno, por defecto la carpeta actual
const vaultPath = process.env.OBSIDIAN_VAULT_PATH || process.cwd();

// Inicializamos el daemon que escucha eventos de Obsidian en segundo plano
startWatcher(vaultPath);

// Inicializamos el servidor HTTP local que escucha al plugin de Obsidian
startFocusServer(12121);

const server = new Server(
  {
    name: "obsidian-copilot-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Registrar herramientas disponibles
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_active_context",
        description: "Obtiene el contexto actual del usuario en Obsidian (archivo abierto, línea del cursor y texto seleccionado).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "scan_instructions",
        description: "Escanea la bóveda completa de Obsidian buscando comandos inline pendientes delimitados por %%agy: comando %%. Devuelve la ruta y el contenido.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "resolve_instruction",
        description: "Reemplaza un comando inline por el código o texto generado en el archivo correspondiente de Obsidian de manera quirúrgica.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Ruta relativa del archivo .md en el vault" },
            targetCommand: { type: "string", description: "El texto exacto del comando (SIN los delimitadores %%agy: %%)" },
            replacement: { type: "string", description: "El contenido de reemplazo a inyectar" }
          },
          required: ["filePath", "targetCommand", "replacement"]
        },
      }
    ],
  };
});

// Manejador de ejecución de herramientas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (request.params.name === "get_active_context") {
      const context = getActiveContext();
      return {
        content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
      };
    }

    if (request.params.name === "scan_instructions") {
      const pending = await scanInstructions(vaultPath);
      return {
        content: [{ type: "text", text: JSON.stringify(pending, null, 2) }],
      };
    }
    
    if (request.params.name === "resolve_instruction") {
      const args = request.params.arguments as any;
      const result = await resolveInstruction(vaultPath, args.filePath, args.targetCommand, args.replacement);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }
    
    throw new Error("Herramienta no reconocida.");
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error de ejecución: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Obsidian Copilot MCP Server conectado a stdio.");
}

main().catch((error) => {
  console.error("Error fatal iniciando el servidor MCP:", error);
  process.exit(1);
});
