# 🧠 Obsitracer

> **Cognitive Tracking & Real-Time Context Orchestrator**  
> Conecta tus notas activas en **Obsidian** con tu terminal **Tmux** y el agente **Antigravity** en tiempo real.

---

## ⚡ Arquitectura y Componentes

Obsitracer elimina la fricción de sincronizar contexto entre tus notas y tu asistente AI:

```text
┌───────────────────────────┐         ┌──────────────────────────────────────┐
│  Obsidian (Vaults)        │ ──────> │  ~/.config/obsitracer/vaults/        │
│  (Plugin TS: Foco + CRUD) │         │  (focus.json, crud.json, manifest)   │
└───────────────────────────┘         └──────────────────┬───────────────────┘
                                                         │
                     ┌───────────────────────────────────┴───────────────────────────────────┐
                     ▼                                                                       ▼
      ┌─────────────────────────────┐                                         ┌─────────────────────────────┐
      │  Tmux Plugin (~/.tmux/...)  │                                         │  Antigravity (PreInvocation)│
      │  • Alt + o: Selector TUI    │                                         │  • Hook Go de micro-deltas  │
      │  • Widget en Status Bar     │                                         │  • Skill obsitracer-operator│
      └─────────────────────────────┘                                         └─────────────────────────────┘
```

- **`cmd/obsitracer/`** — CLI unificado en Go (`obsitracer`) con TUI interactiva (Huh/Lipgloss), selector flotante, widget de tmux y motor de hook.
- **`obsitracer/`** — Plugin de Obsidian (TypeScript): monitorea cursor, cambios en notas (CRUD) y estado activo de forma reactiva.
- **`plugins/obsitracer/`** — Plugin oficial para Antigravity (Hook `PreInvocation` ultrarrápido y Skill `obsitracer-operator`).
- **`tmux/`** — Plugin autónomo de Tmux (`~/.tmux/plugins/obsitracer`) con keybindings globales (`Alt + o`).
- **`flake.nix`** — Entorno declarativo y reproducible (`nix run` para instalación completa y `nix develop` para desarrollo).

---

## 🚀 Instalación Rápida

### Opción 1: Con Nix Flakes (Recomendado)
Ejecuta el orquestador interactivo en un entorno hermético con todas las dependencias (`go`, `esbuild`, `tmux`, `fzf`):

```bash
nix run
```

> **¿Qué hace `nix run`?**
> 1. Compila el CLI unificado en Go (`bin/obsitracer`).
> 2. Crea el enlace simbólico global en `~/.local/bin/obsitracer`.
> 3. Lanza la TUI interactiva para seleccionar tus Vaults, compilar el plugin de Obsidian y registrar los plugins en Tmux y Antigravity.

---

### Opción 2: Entorno Nativo / Go Local

```bash
# Compilar CLI
go build -ldflags="-s -w" -o bin/obsitracer ./cmd/obsitracer

# Enlazar a tu PATH
ln -sf "$(pwd)/bin/obsitracer" ~/.local/bin/obsitracer

# Ejecutar instalador interactivo
obsitracer install
```

---

## 🎛️ Comandos del CLI (`obsitracer`)

Una vez instalado, tienes el comando `obsitracer` disponible globalmente:

| Comando | Descripción |
| :--- | :--- |
| `obsitracer` / `obsitracer install` | Lanza el asistente interactivo TUI de instalación y sincronización. |
| `obsitracer status` | Muestra el estado del sistema, vaults indexados y foco activo. |
| `obsitracer select` | Abre el selector TUI interactivo para sintonizar el Vault en el panel actual. |
| `obsitracer target <vault>` | Sintoniza directamente el foco del panel al Vault especificado. |
| `obsitracer clear` | Silencia/apaga el foco de contexto en el panel actual. |
| `obsitracer widget` | Genera la salida formateada para la barra de estado de Tmux. |
| `obsitracer hook` | Ejecuta el hook PreInvocation de Antigravity (inyección de micro-deltas). |

---

## 🖥️ Integración con Tmux

Obsitracer opera como un **plugin autónomo** instalado en `~/.tmux/plugins/obsitracer/`.

### 1. Atajos de Teclado (Keybindings)
- **`Alt + o`** (Directo, sin prefijo): Abre el selector flotante para sintonizar el Vault del panel activo.
- **`Prefix + o`** (`Ctrl+a -> o`): Atajo alternativo con prefijo.

### 2. Widget de Status Bar (Tema TokyoNight / Ukiyo)
El widget de Obsitracer se integra de forma nativa en tu barra de estado de Tmux. Si utilizas el plugin `tmux-ukiyo`, puedes integrarlo en tus módulos de estilo (ej. `~/.tmux/modules/style.conf`):

```tmux
# En ~/.tmux/modules/style.conf:
set -g @ukiyo-custom-plugin-colors "notice bg_pane"
```

---

## 📂 Mapa de Rutas y Configuración

| Componente | Ubicación |
| :--- | :--- |
| **CLI Global** | [~/.local/bin/obsitracer](file:///home/manu/.local/bin/obsitracer) |
| **Registro de Vaults** | [~/.config/obsitracer/vaults.json](file:///home/manu/.config/obsitracer/vaults.json) |
| **Buzones Temporales** | `~/.config/obsitracer/vaults/{VaultName}/` (`focus.json`, `crud.json`) |
| **Plugin de Tmux** | [~/.tmux/plugins/obsitracer/](file:///home/manu/.tmux/plugins/obsitracer) |
| **Plugin Antigravity** | [~/.gemini/antigravity-cli/plugins/obsitracer/](file:///home/manu/.gemini/antigravity-cli/plugins/obsitracer) |
| **Hook PreInvocation** | [plugins/obsitracer/hooks.json](file:///home/manu/Documents/repositorios/Obsitracer/plugins/obsitracer/hooks.json) |
| **Skill de Operador** | [plugins/obsitracer/skills/obsitracer-operator/SKILL.md](file:///home/manu/Documents/repositorios/Obsitracer/plugins/obsitracer/skills/obsitracer-operator/SKILL.md) |

