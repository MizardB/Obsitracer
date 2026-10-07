/**
 * Obsitracer Extension for Pi Coding Agent (pi-coding-agent)
 *
 * Conecta las notas activas, cursor y cambios estructurales de Obsidian
 * con la sesión activa de Pi Coding Agent en tiempo real.
 * Proporciona aislamiento estricto de target por sesión.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";

interface VaultEntry {
  name: string;
  path: string;
}

interface HookPayload {
  injectSteps?: Array<{
    ephemeralMessage?: string;
  }>;
}

/**
 * Resuelve la ruta al ejecutable de obsitracer.
 */
function getObsitracerBin(): string {
  if (process.env.OBSITRACER_BIN && fs.existsSync(process.env.OBSITRACER_BIN)) {
    return process.env.OBSITRACER_BIN;
  }

  const localBin = path.join(os.homedir(), ".local", "bin", "obsitracer");
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  return "obsitracer";
}

/**
 * Obtiene el ID canónico de la sesión activa de Pi.
 */
function getSessionId(ctx: ExtensionContext): string {
  const sm = ctx.sessionManager as any;
  if (typeof sm?.getSessionId === "function") {
    const id = sm.getSessionId();
    if (id && typeof id === "string") return id;
  }
  if (typeof sm?.getSessionFile === "function") {
    const file = sm.getSessionFile();
    if (file && typeof file === "string") {
      return path.basename(file, path.extname(file));
    }
  }
  return "default";
}

/**
 * Consulta el target configurado o resuelto para la sesión.
 */
function getSessionTarget(sessionId: string): string | undefined {
  try {
    const bin = getObsitracerBin();
    const res = spawnSync(bin, ["target", "--session", sessionId, "--raw"], {
      encoding: "utf-8",
      timeout: 2000,
    });
    if (res.status === 0 && res.stdout) {
      const trimmed = res.stdout.trim();
      if (trimmed && !trimmed.startsWith("Ningún foco")) {
        return trimmed;
      }
    }
  } catch {
    // Fail open
  }
  return undefined;
}

/**
 * Sintoniza una bóveda para la sesión activa.
 */
function setSessionTarget(sessionId: string, vault: string): boolean {
  try {
    const bin = getObsitracerBin();
    const res = spawnSync(bin, ["target", "--session", sessionId, vault], {
      encoding: "utf-8",
      timeout: 3000,
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Silencia o desconecta la bóveda de la sesión activa.
 */
function clearSessionTarget(sessionId: string): boolean {
  try {
    const bin = getObsitracerBin();
    const res = spawnSync(bin, ["clear", "--session", sessionId], {
      encoding: "utf-8",
      timeout: 3000,
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Lee la lista de Vaults registrados en Obsitracer.
 */
function getAvailableVaults(): string[] {
  // 1. Leer directamente ~/.config/obsitracer/vaults.json
  const registryPath = path.join(os.homedir(), ".config", "obsitracer", "vaults.json");
  if (fs.existsSync(registryPath)) {
    try {
      const raw = fs.readFileSync(registryPath, "utf-8");
      const list: VaultEntry[] = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        return list.map((v) => v.name).filter(Boolean);
      }
    } catch {
      // fallback
    }
  }

  // 2. Fallback: ejecutar 'obsitracer vaults'
  try {
    const bin = getObsitracerBin();
    const res = spawnSync(bin, ["vaults"], { encoding: "utf-8", timeout: 2000 });
    if (res.status === 0 && res.stdout) {
      return res.stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // fallback
  }

  return [];
}

/**
 * Ejecuta el hook PreInvocation de Obsitracer para la sesión dada.
 */
function runObsitracerHook(sessionId: string, invocationNum: number): string | undefined {
  try {
    const bin = getObsitracerBin();
    const inputPayload = JSON.stringify({
      conversationId: sessionId,
      invocationNum,
    });

    const res = spawnSync(bin, ["hook", "--session", sessionId], {
      input: inputPayload,
      encoding: "utf-8",
      timeout: 5000,
    });

    if (res.status === 0 && res.stdout) {
      const payload: HookPayload = JSON.parse(res.stdout.trim());
      if (payload.injectSteps && payload.injectSteps.length > 0) {
        const msg = payload.injectSteps[0].ephemeralMessage;
        if (msg && msg.trim()) {
          return msg.trim();
        }
      }
    }
  } catch {
    // Fail open
  }
  return undefined;
}

/**
 * Muestra el selector interactivo TUI para sintonizar o silenciar una bóveda.
 */
async function showVaultSelector(ctx: ExtensionContext): Promise<void> {
  if (!ctx.hasUI) {
    return;
  }

  const sessionId = getSessionId(ctx);
  const currentTarget = getSessionTarget(sessionId);
  const vaults = getAvailableVaults();

  if (vaults.length === 0) {
    ctx.ui.notify?.("No hay bóvedas registradas en Obsitracer (~/.config/obsitracer/vaults.json)", "warning");
    return;
  }

  const options: string[] = [];
  for (const v of vaults) {
    const prefix = v === currentTarget ? "● 📁 " : "📁 ";
    const suffix = v === currentTarget ? " (Activo)" : "";
    options.push(`${prefix}${v}${suffix}`);
  }
  options.push("✕ Desconectar (Modo Silencio)");

  const title = currentTarget
    ? `🧠 Obsitracer — Foco actual: [${currentTarget}]`
    : "🧠 Obsitracer — Sintonizar Bóveda de Obsidian";

  const selected = await ctx.ui.select(title, options);
  if (!selected) {
    return; // Cancelado por el usuario
  }

  if (selected.includes("Desconectar") || selected.startsWith("✕")) {
    clearSessionTarget(sessionId);
    ctx.ui.setStatus("obsitracer", undefined);
    ctx.ui.notify?.("Obsitracer silenciado para esta sesión", "info");
    return;
  }

  const chosenVault = selected
    .replace(/^[●\s]*📁\s*/, "")
    .replace(/\s*\(Activo\)$/, "")
    .trim();

  if (chosenVault) {
    setSessionTarget(sessionId, chosenVault);
    ctx.ui.setStatus("obsitracer", `👁️ ${chosenVault}`);
    ctx.ui.notify?.(`Obsitracer sintonizado a [${chosenVault}]`, "info");
  }
}

export default async function (pi: ExtensionAPI) {
  let invocationCount = 0;

  // 1. session_start: Sincronizar badge de estado al iniciar o cambiar de sesión
  pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
    try {
      invocationCount = 0;
      const sessionId = getSessionId(ctx);
      const vault = getSessionTarget(sessionId);
      ctx.ui.setStatus("obsitracer", vault ? `👁️ ${vault}` : undefined);
    } catch (err) {
      console.warn("[obsitracer] Error en session_start:", err);
    }
  });

  // 2. before_agent_start: Inyectar micro-deltas y cambios de Obsidian antes de cada turno
  pi.on(
    "before_agent_start",
    async (
      event: BeforeAgentStartEvent,
      ctx: ExtensionContext
    ): Promise<BeforeAgentStartEventResult | void> => {
      try {
        const sessionId = getSessionId(ctx);
        invocationCount++;

        const ephemeralMsg = runObsitracerHook(sessionId, invocationCount);

        // Actualizar status visual en el footer
        const currentVault = getSessionTarget(sessionId);
        ctx.ui.setStatus("obsitracer", currentVault ? `👁️ ${currentVault}` : undefined);

        if (ephemeralMsg) {
          event.prompt = ephemeralMsg + "\n\n" + event.prompt;
          return {
            message: {
              customType: "obsitracer",
              content: ephemeralMsg,
              display: true,
            },
          };
        }
      } catch (err) {
        console.warn("[obsitracer] Error en before_agent_start:", err);
      }
    }
  );

  // 3. Comandos interactivos /vault y /obsitracer
  pi.registerCommand("vault", {
    description: "Sintoniza o silencia la bóveda de Obsidian para la sesión activa",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await showVaultSelector(ctx);
    },
  });

  pi.registerCommand("obsitracer", {
    description: "Sintoniza o silencia la bóveda de Obsidian para la sesión activa",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await showVaultSelector(ctx);
    },
  });

  // 4. Atajo de teclado rápido (Alt+o)
  try {
    pi.registerShortcut("alt+o", {
      description: "Selector rápido de bóveda de Obsidian (Obsitracer)",
      handler: async (ctx: ExtensionContext) => {
        await showVaultSelector(ctx);
      },
    });
  } catch {
    // Si el entorno o shortcut no está disponible, continuar sin fallar
  }
}
