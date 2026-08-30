# Obsitracer

English | [Español](README.es.md)

> Cognitive Tracking & Real-Time Context Orchestrator  
> Passive, real-time contextual bridge between Obsidian, Tmux, and your AI agent.

---

## The Problem

Obsidian is one of the most powerful tools for personal knowledge management, systems documentation, and second brains. However, when collaborating with terminal-based AI coding agents (such as Antigravity / Gemini CLI), current workflows suffer from severe friction:

1. **AI is blind to your active context:** When editing a note or exploring a diagram, the AI agent has no awareness of what you are viewing. You are forced to manually copy-paste snippets or write verbose prompts just to provide orientation (*"look at file X inside folder Y..."*).
2. **Static and expensive RAG:** Traditional search or retrieval systems ingest entire file trees in bulk, waste thousands of context tokens on unedited content, and suffer from latency lag with respect to edits made seconds ago.
3. **Lack of tactile presence:** The AI has no physical sense of your navigation: it does not know if you switched active tabs, which line holds your cursor, or what notes you created during your current session.

---

## The Solution: Giving AI Tactile Awareness

Obsitracer completely eliminates this friction by giving your terminal AI agent **passive contextual awareness**:

* **Reactive Tracking:** A lightweight TypeScript plugin runs in the background of Obsidian, monitoring active notes, precise cursor position (line and column), and file CRUD events.
* **Pre-Turn Hook Injection (< 2ms):** Right before your AI agent processes any prompt in the terminal, a Go pre-invocation hook evaluates active file deltas and injects only recent modifications into the agent's context.
* **Zero Token Waste:** If you did not modify files between prompt turns, Obsitracer sends a silent payload. If you changed notes or edited a paragraph, the AI receives the exact diff instantly.
* **Visual Control in Tmux:** Select which Obsidian vault is tracked in each terminal pane using a floating popup (`Alt + o`) and view active note status badges directly in your Tmux status bar.

---

## System Requirements

Before installing Obsitracer, ensure you have the following prerequisites:

| Component | Minimum Version | Purpose |
| :--- | :--- | :--- |
| **Operating System** | Linux (NixOS, Arch, Ubuntu, Fedora, etc.) or macOS | POSIX atomic IPC and file descriptor support. |
| **Obsidian** | v1.5.0 or higher | Knowledge base frontend with *Community Plugins* enabled. |
| **Tmux** | v3.2 or higher | Terminal multiplexer, floating popup selector (`Alt + o`), and status widget. |
| **Antigravity CLI / AGY** | v1.0.0 or higher | AI agent consuming the `PreInvocation` hook. |
| **Build Environment** | **Nix Flakes** (Recommended) or **Go 1.22+ and Node/esbuild** | Hermetic compilation and binary deployment. |

---

## Quick Installation

### Option 1: Using Nix Flakes (Recommended)

If you use Nix, run the interactive orchestrator in a hermetic environment:

```bash
nix run
```

This single command:
1. Compiles the Go engine (`obsitracer`).
2. Bundles the Obsidian TypeScript plugin with `esbuild`.
3. Creates the global symlink at `~/.local/bin/obsitracer`.
4. Launches the interactive TUI to discover your vaults and link Tmux and Antigravity plugins.

---

### Option 2: Native Go Compilation

To build and install manually:

```bash
# 1. Clone repository
git clone https://github.com/MizardB/Obsitracer.git
cd Obsitracer

# 2. Build Obsidian plugin
cd obsitracer
npm install
npm run build
cd ..

# 3. Compile Go CLI
go build -ldflags="-s -w" -o bin/obsitracer ./cmd/obsitracer

# 4. Symlink to PATH
ln -sf "$(pwd)/bin/obsitracer" ~/.local/bin/obsitracer

# 5. Run interactive installer
obsitracer install
```

---

## Daily Workflow Manual

Obsitracer is designed to operate completely transparently:

### 1. Work in Obsidian Normally
Open your vault in Obsidian. Edit notes, create documents, organize folders, or write code snippets. The plugin records navigation events with sub-millisecond debouncing without impacting editor performance.

### 2. Tune Vault in Your Terminal Pane
In any Tmux pane where you plan to interact with your AI assistant:
* Press `Alt + o` to open the interactive popup selector.
* Select the target vault with arrow keys and press `Enter`.
* To exit without modifying focus, press `Esc` or `q`.
* To silence context injection in that pane, select `[✕] Silenciar / Apagar foco`.

Your Tmux status bar will immediately display the live badge:
```text
[👓 MyVault/ActiveNote.md]
```

### 3. Talk to Your AI Agent
Open your agent in the terminal (`agy`) and prompt it directly:
* *"Summarize what I just wrote."*
* *"Fix the syntax in the code block I am currently viewing."*
* *"Generate conclusion points based on the list above."*

The AI already knows which file is open, where your cursor is positioned, and what content was recently edited.

---

## CLI Reference (`obsitracer`)

The global binary `obsitracer` provides utility commands for automation, scripts, and diagnostic inspection:

| Command | Description |
| :--- | :--- |
| `obsitracer` / `obsitracer install` | Launches the interactive TUI installer to link or update vaults. |
| `obsitracer status` | Displays system status, registered vaults, and real-time active focus. |
| `obsitracer select` | Opens the floating TUI vault selector for the current Tmux pane. |
| `obsitracer target <vault_name>` | Sets the target vault for the current Tmux pane. |
| `obsitracer clear` | Clears and silences context tracking in the current pane. |
| `obsitracer widget` | Generates formatted badge output for the Tmux status bar. |
| `obsitracer hook` | Executes the PreInvocation hook consumed by the AI agent. |

---

## Tmux Keybindings

| Keybinding | Action |
| :--- | :--- |
| `Alt + o` | Opens floating interactive vault selector for current pane. |
| `Prefix + O` | Secondary keybinding with Tmux prefix (`Ctrl+a -> O` / `Ctrl+b -> O`). |
| `Esc` / `q` | Cancels and closes popup selector while preserving current target. |

---

## Philosophy and Contributing

Obsitracer is an opinionated project designed and optimized for terminal-first developer workflows:
* **Primary Environment:** Linux / NixOS with Tmux.
* **Target AI Agent:** Antigravity / Gemini CLI (via PreInvocation hooks).
* **Knowledge Frontend:** Obsidian.

### Pull Requests and Extensions
Community contributions are welcome, particularly for:
* Integrations with additional terminal-based AI agents.
* Performance optimizations in the Obsidian event loop and bundling.
* Compatibility improvements across POSIX platforms.

**Contribution Requirements:**
1. **Conventional Commits:** All commits must follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
2. **Asynchronous Review:** Pull Requests are evaluated asynchronously with AI audit tooling before merging into the main branch.

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
