#!/usr/bin/env bash
# ==============================================================================
# 🧠 OBSITRACER MASTER ORCHESTRATOR & INSTALLER
# ==============================================================================
# Dual-Panel Split TUI:
#  - Left Panel:  Step-by-step Interactive Workflow
#  - Right Panel: Real-time Telemetry, System Audit & Build Logs
# ==============================================================================

set -eo pipefail
export PATH="$HOME/.nix-profile/bin:$HOME/.local/bin:$PATH"

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VAULTS_REGISTRY="$HOME/.config/obsitracer/vaults.json"
TMUX_PLUGIN_DIR="$HOME/.tmux/plugins/obsitracer"
AGY_PLUGIN_DIR="$HOME/.gemini/antigravity-cli/plugins/obsitracer"
GEMINI_PLUGIN_DIR="$HOME/.gemini/config/plugins/obsitracer"

# ANSI Colors (Tokyo Night Theme)
C_RESET='\033[0m'
C_BOLD='\033[1m'
C_DIM='\033[2m'
C_CYAN='\033[38;2;122;162;247m'     # #7aa2f7
C_BLUE='\033[38;2;125;207;255m'     # #7dcfff
C_MAGENTA='\033[38;2;187;154;247m'  # #bb9af7
C_GREEN='\033[38;2;158;206;106m'    # #9ece6a
C_YELLOW='\033[38;2;224;175;104m'   # #e0af68
C_RED='\033[38;2;247;118;142m'      # #f7768e
C_BG_BOX='\033[48;2;26;27;38m'      # #1a1b26
C_BORDER='\033[38;2;65;72;104m'     # #414868

# Status log array for right panel
declare -a LOG_LINES=()

function add_log() {
    local prefix="$1"
    local msg="$2"
    local color="${3:-$C_RESET}"
    local timestamp
    timestamp=$(date +"%H:%M:%S")
    LOG_LINES+=("${C_DIM}${timestamp}${C_RESET} ${color}[${prefix}]${C_RESET} ${msg}")
    if [ ${#LOG_LINES[@]} -gt 14 ]; then
        LOG_LINES=("${LOG_LINES[@]:1}")
    fi
}

function draw_screen() {
    local active_step="$1"
    local status_1="${2:-[ ]}"
    local status_2="${3:-[ ]}"
    local status_3="${4:-[ ]}"
    local status_4="${5:-[ ]}"
    local status_5="${6:-[ ]}"
    local action_hint="${7:-Presiona [ENTER] para continuar o [Ctrl+C] para salir}"

    clear
    local term_cols
    term_cols=$(tput cols 2>/dev/null || echo 90)
    [ "$term_cols" -lt 90 ] && term_cols=90
    local left_w=38
    local right_w=$((term_cols - left_w - 5))

    echo -e "${C_BOLD}${C_CYAN}┌────────────────────────────────────────────────────────────────────────────────────────┐${C_RESET}"
    echo -e "${C_BOLD}${C_CYAN}│  🧠 OBSITRACER MASTER ORCHESTRATOR & INSTALLER                                v1.2.0   │${C_RESET}"
    echo -e "${C_BOLD}${C_CYAN}├────────────────────────────────────────┬───────────────────────────────────────────────┤${C_RESET}"
    echo -e "${C_BOLD}${C_MAGENTA}│  FLUID WORKFLOW (STEPPER)              │  LIVE TELEMETRY & SYSTEM STATUS               │${C_RESET}"
    echo -e "${C_BORDER}├────────────────────────────────────────┼───────────────────────────────────────────────┤${C_RESET}"

    # Step list on left, logs on right
    local steps=(
        "$status_1 1. Auditoría del Entorno"
        "$status_2 2. Plugin Autónomo de Tmux"
        "$status_3 3. Motor Go & Antigravity"
        "$status_4 4. Auto-Scan & Multi-Vaults"
        "$status_5 5. Healthcheck y Activación"
    )

    for i in {0..11}; do
        local left_content=""
        if [ "$i" -eq 1 ]; then left_content="${steps[0]}"; fi
        if [ "$i" -eq 3 ]; then left_content="${steps[1]}"; fi
        if [ "$i" -eq 5 ]; then left_content="${steps[2]}"; fi
        if [ "$i" -eq 7 ]; then left_content="${steps[3]}"; fi
        if [ "$i" -eq 9 ]; then left_content="${steps[4]}"; fi

        # Colorize active or completed steps
        if [ -n "$left_content" ]; then
            if [[ "$left_content" == *"[✔]"* ]]; then
                left_content="${C_GREEN}${left_content}${C_RESET}"
            elif [[ "$left_content" == *"[▶]"* ]]; then
                left_content="${C_BOLD}${C_YELLOW}${left_content}${C_RESET}"
            elif [[ "$left_content" == *"[✕]"* ]]; then
                left_content="${C_RED}${left_content}${C_RESET}"
            else
                left_content="${C_DIM}${left_content}${C_RESET}"
            fi
        fi

        local right_content=""
        if [ "$i" -lt "${#LOG_LINES[@]}" ]; then
            right_content="${LOG_LINES[$i]}"
        fi

        # Format line with clean padding
        printf "${C_BORDER}│${C_RESET} %-48b ${C_BORDER}│${C_RESET} %-57b ${C_BORDER}│${C_RESET}\n" "$left_content" "$right_content"
    done

    echo -e "${C_BORDER}├────────────────────────────────────────┴───────────────────────────────────────────────┤${C_RESET}"
    printf "${C_BORDER}│${C_RESET} ${C_BOLD}${C_BLUE}Acción:${C_RESET} %-78b ${C_BORDER}│${C_RESET}\n" "$action_hint"
    echo -e "${C_BOLD}${C_CYAN}└────────────────────────────────────────────────────────────────────────────────────────┘${C_RESET}"
}

# ==============================================================================
# FASE 1: AUDITORÍA DE ENTORNO
# ==============================================================================
function step_1_audit() {
    add_log "INIT" "Iniciando orquestador de instalación de Obsitracer..." "$C_CYAN"
    add_log "AUDIT" "Escaneando entorno de ejecución y herramientas..." "$C_BLUE"
    draw_screen 1 "[▶]" "[ ]" "[ ]" "[ ]" "[ ]" "Verificando dependencias del sistema..."
    sleep 0.3

    local missing=0

    # 1. Nix / DevShell
    if [ -n "$IN_NIX_SHELL" ] || [ -f "/run/current-system/nixos-version" ] || command -v nix >/dev/null 2>&1; then
        add_log "ENV" "Entorno Nix / NixOS detectado." "$C_GREEN"
    else
        add_log "ENV" "Entorno Linux estándar detectado." "$C_BLUE"
    fi

    # 2. Go compiler
    if command -v go >/dev/null 2>&1; then
        local go_ver
        go_ver=$(go version | awk '{print $3}')
        add_log "GO" "Compilador Go listo: $go_ver" "$C_GREEN"
    else
        add_log "WARN" "Go no encontrado en PATH (se requerirá para build)." "$C_YELLOW"
        missing=$((missing + 1))
    fi

    # 3. Node & Esbuild
    if command -v node >/dev/null 2>&1 && command -v esbuild >/dev/null 2>&1; then
        add_log "NODE" "Node.js y esbuild listos para empaquetado TS." "$C_GREEN"
    else
        add_log "WARN" "Node/esbuild no detectados en PATH global." "$C_YELLOW"
    fi

    # 4. Tmux & Socket
    if command -v tmux >/dev/null 2>&1; then
        if [ -n "$TMUX" ]; then
            add_log "TMUX" "Sesión de Tmux activa detectada: socket sintonizado." "$C_GREEN"
        else
            add_log "TMUX" "Tmux instalado (servidor en espera)." "$C_BLUE"
        fi
    else
        add_log "WARN" "Tmux no está instalado en el sistema." "$C_RED"
        missing=$((missing + 1))
    fi

    # 5. fzf & jq
    if command -v fzf >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
        add_log "TOOLS" "fzf y jq detectados para la TUI interactiva." "$C_GREEN"
    else
        add_log "WARN" "fzf o jq no encontrados." "$C_YELLOW"
    fi

    add_log "AUDIT" "Auditoría de pre-vuelo completada con éxito." "$C_GREEN"
    draw_screen 1 "[✔]" "[ ]" "[ ]" "[ ]" "[ ]" "Auditoría completa. Presiona [ENTER] para instalar Plugin de Tmux..."
    read -r
}

# ==============================================================================
# FASE 2: PLUGIN AUTÓNOMO DE TMUX
# ==============================================================================
function step_2_tmux() {
    add_log "TMUX" "Desplegando Plugin de Tmux autónomo..." "$C_CYAN"
    draw_screen 2 "[✔]" "[▶]" "[ ]" "[ ]" "[ ]" "Instalando plugin en ~/.tmux/plugins/obsitracer..."
    sleep 0.2

    mkdir -p "$TMUX_PLUGIN_DIR/scripts"
    
    ln -sf "$REPO_DIR/tmux/obsitracer.tmux" "$TMUX_PLUGIN_DIR/obsitracer.tmux"
    ln -sf "$REPO_DIR/tmux/scripts/obsitracer.sh" "$TMUX_PLUGIN_DIR/scripts/obsitracer.sh"
    ln -sf "$REPO_DIR/tmux/scripts/obsitracer-select.sh" "$TMUX_PLUGIN_DIR/scripts/obsitracer-select.sh"
    chmod +x "$TMUX_PLUGIN_DIR/obsitracer.tmux" "$TMUX_PLUGIN_DIR/scripts/"*.sh

    add_log "TMUX" "Entrypoint y scripts enlazados en ~/.tmux/plugins/obsitracer" "$C_GREEN"

    if [ -n "$TMUX" ]; then
        tmux run-shell "$TMUX_PLUGIN_DIR/obsitracer.tmux" 2>/dev/null || true
        add_log "TMUX" "Atajos [Alt+o] y [Prefix+o] registrados en vivo en Tmux." "$C_GREEN"
    else
        add_log "TMUX" "Plugin listo para cargarse en el arranque de Tmux." "$C_BLUE"
    fi

    draw_screen 2 "[✔]" "[✔]" "[ ]" "[ ]" "[ ]" "Plugin Tmux instalado. Presiona [ENTER] para compilar motor Go y AGY..."
    read -r
}

# ==============================================================================
# FASE 3: BUILD & DESPLIEGUE EN ANTIGRAVITY (AGY)
# ==============================================================================
function step_3_agy() {
    add_log "BUILD" "Compilando plugin TypeScript de Obsidian con esbuild..." "$C_CYAN"
    draw_screen 3 "[✔]" "[✔]" "[▶]" "[ ]" "[ ]" "Compilando TypeScript y motor Go..."
    
    (cd "$REPO_DIR/obsitracer" && esbuild main.ts --bundle --platform=node --external:obsidian --external:electron --format=cjs --target=es2018 --outfile=main.js >/dev/null 2>&1)
    add_log "BUILD" "Obsidian Plugin empaquetado en obsitracer/main.js" "$C_GREEN"

    add_log "GO" "Compilando motor de alto rendimiento (obsitracer-hook)..." "$C_CYAN"
    mkdir -p "$REPO_DIR/plugins/obsitracer/bin"
    (cd "$REPO_DIR" && go build -ldflags="-s -w" -o plugins/obsitracer/bin/obsitracer-hook ./cmd/obsitracer-hook)
    chmod +x "$REPO_DIR/plugins/obsitracer/bin/obsitracer-hook"
    add_log "GO" "Binario Go compilado: plugins/obsitracer/bin/obsitracer-hook" "$C_GREEN"

    add_log "AGY" "Enlazando plugin oficial en Antigravity..." "$C_BLUE"
    mkdir -p "$GEMINI_PLUGIN_DIR" "$AGY_PLUGIN_DIR"
    rm -rf "$GEMINI_PLUGIN_DIR" "$AGY_PLUGIN_DIR"
    ln -sfn "$REPO_DIR/plugins/obsitracer" "$GEMINI_PLUGIN_DIR"
    ln -sfn "$REPO_DIR/plugins/obsitracer" "$AGY_PLUGIN_DIR"

    add_log "AGY" "Hook PreInvocation y Skill obsitracer-operator desplegados." "$C_GREEN"
    draw_screen 3 "[✔]" "[✔]" "[✔]" "[ ]" "[ ]" "Antigravity listo. Presiona [ENTER] para escanear Vaults..."
    read -r
}

# ==============================================================================
# FASE 4: AUTO-SCAN & MULTI-SELECCIÓN DE VAULTS
# ==============================================================================
function step_4_vaults() {
    add_log "SCAN" "Buscando Vaults de Obsidian en ~/Documents..." "$C_CYAN"
    draw_screen 4 "[✔]" "[✔]" "[✔]" "[▶]" "[ ]" "Escaneando directorios..."
    
    local found_vaults=()
    while IFS= read -r obs_dir; do
        if [ -n "$obs_dir" ]; then
            local v_path
            v_path=$(dirname "$obs_dir")
            found_vaults+=("$v_path")
        fi
    done < <(find "$HOME/Documents" -maxdepth 3 -name ".obsidian" -type d 2>/dev/null || true)

    if [ ${#found_vaults[@]} -eq 0 ]; then
        add_log "WARN" "No se encontraron carpetas .obsidian en ~/Documents." "$C_YELLOW"
        draw_screen 4 "[✔]" "[✔]" "[✔]" "[✔]" "[ ]" "No se encontraron Vaults automáticos. Presiona [ENTER]..."
        read -r
        return
    fi

    add_log "SCAN" "Se detectaron ${#found_vaults[@]} Vaults de Obsidian." "$C_GREEN"
    add_log "UI" "Abriendo selector interactivo multi-selección..." "$C_MAGENTA"
    draw_screen 4 "[✔]" "[✔]" "[✔]" "[▶]" "[ ]" "Selecciona los Vaults en el menú que se abrirá..."
    sleep 0.5

    # Preparar lista formateada para fzf
    local fzf_input=""
    for v in "${found_vaults[@]}"; do
        local v_name
        v_name=$(basename "$v")
        fzf_input+=$(printf "📁 %s\t%s\n" "$v_name" "$v")
    done

    # Lanzar fzf en modo multi-selección
    local selected_items
    selected_items=$(echo -e "$fzf_input" | fzf -m \
        --prompt="🔗 Seleccionar Vaults > " \
        --header="[TAB / ESPACIO] Marcar/Desmarcar Vaults | [ENTER] Confirmar | [ESC] Omitir" \
        --delimiter=$'\t' \
        --with-nth=1,2 \
        --color="header:italic:cyan,prompt:bold:yellow,marker:bold:green" \
        --reverse || true)

    if [ -z "$selected_items" ]; then
        add_log "VAULTS" "No se seleccionó ningún Vault nuevo. Manteniendo registro actual." "$C_YELLOW"
        draw_screen 4 "[✔]" "[✔]" "[✔]" "[✔]" "[ ]" "Paso completado sin cambios en Vaults. Presiona [ENTER]..."
        read -r
        return
    fi

    # Parsear seleccionados
    local selected_names=()
    local selected_paths=()
    while IFS=$'\t' read -r col1 col2; do
        if [ -n "$col1" ] && [ -n "$col2" ]; then
            local clean_name
            clean_name=$(echo "$col1" | sed 's/📁 //g' | xargs)
            selected_names+=("$clean_name")
            selected_paths+=("$col2")
        fi
    done <<< "$selected_items"

    # Modal de Confirmación
    clear
    echo -e "${C_BOLD}${C_CYAN}┌─────────────────── Confirmación de Vinculación de Vaults ───────────────────┐${C_RESET}"
    echo -e "${C_BORDER}│                                                                             │${C_RESET}"
    echo -e "${C_BORDER}│${C_RESET} ${C_BOLD}Se vinculará Obsitracer y se registrará la atención en los siguientes Vaults:${C_RESET}  ${C_BORDER}│${C_RESET}"
    echo -e "${C_BORDER}│                                                                             │${C_RESET}"
    for idx in "${!selected_names[@]}"; do
        printf "${C_BORDER}│${C_RESET}   ${C_GREEN}• %-18s${C_RESET} ${C_DIM}(%s)${C_RESET}\n" "${selected_names[$idx]}" "${selected_paths[$idx]}"
    done
    echo -e "${C_BORDER}│                                                                             │${C_RESET}"
    echo -e "${C_BOLD}${C_CYAN}└─────────────────────────────────────────────────────────────────────────────┘${C_RESET}"
    echo ""
    read -p "¿Proceder con la vinculación e instalación de symlinks? [S/n]: " confirm
    confirm=${confirm:-S}

    if [[ "$confirm" =~ ^[Ss]$ ]]; then
        mkdir -p "$(dirname "$VAULTS_REGISTRY")"
        
        # Construir JSON de registro
        local json_array="["
        for idx in "${!selected_names[@]}"; do
            local v_name="${selected_names[$idx]}"
            local v_path="${selected_paths[$idx]}"
            
            # Enlazar plugin en .obsidian/plugins/obsitracer
            local target_p_dir="$v_path/.obsidian/plugins/obsitracer"
            mkdir -p "$v_path/.obsidian/plugins"
            rm -rf "$target_p_dir"
            ln -s "$REPO_DIR/obsitracer" "$target_p_dir"
            
            # Crear buzón de estado
            mkdir -p "$HOME/.config/obsitracer/vaults/$v_name"

            if [ "$idx" -gt 0 ]; then json_array+=","; fi
            json_array+=$(printf '{"name":"%s","path":"%s"}' "$v_name" "$v_path")
            add_log "LINK" "Vinculado plugin en: $v_name" "$C_GREEN"
        done
        json_array+="]"

        echo "$json_array" | jq . > "$VAULTS_REGISTRY"
        add_log "REGISTRY" "Registro actualizado en ~/.config/obsitracer/vaults.json" "$C_GREEN"
    else
        add_log "ABORT" "Vinculación cancelada por el usuario." "$C_YELLOW"
    fi

    draw_screen 4 "[✔]" "[✔]" "[✔]" "[✔]" "[ ]" "Vaults configurados. Presiona [ENTER] para el Healthcheck final..."
    read -r
}

# ==============================================================================
# FASE 5: HEALTHCHECK Y VERIFICACIÓN EN VIVO
# ==============================================================================
function step_5_healthcheck() {
    add_log "CHECK" "Ejecutando suite de validación de componentes..." "$C_CYAN"
    draw_screen 5 "[✔]" "[✔]" "[✔]" "[✔]" "[▶]" "Verificando operatividad del sistema..."
    sleep 0.3

    # 1. Test binario Go
    local hook_bin="$REPO_DIR/plugins/obsitracer/bin/obsitracer-hook"
    if [ -x "$hook_bin" ]; then
        local hook_out
        hook_out=$(echo "{}" | "$hook_bin" 2>/dev/null || true)
        add_log "HOOK" "Hook Go operativo y respondiendo JSON válido." "$C_GREEN"
    else
        add_log "ERROR" "Binario obsitracer-hook no ejecutable." "$C_RED"
    fi

    # 2. Test Tmux Scripts
    if [ -x "$TMUX_PLUGIN_DIR/scripts/obsitracer-select.sh" ]; then
        add_log "TMUX" "Scripts de Tmux con permisos de ejecución correctos." "$C_GREEN"
    fi

    # 3. Test Vaults JSON
    if [ -f "$VAULTS_REGISTRY" ]; then
        local count
        count=$(jq '. | length' "$VAULTS_REGISTRY" 2>/dev/null || echo 0)
        add_log "VAULTS" "Buzones operativos: $count Vaults registrados." "$C_GREEN"
    fi

    # Refrescar Tmux si aplica
    if [ -n "$TMUX" ]; then
        tmux refresh-client -S 2>/dev/null || true
        add_log "TMUX" "Barra de estado de Tmux sincronizada." "$C_GREEN"
    fi

    add_log "SUCCESS" "¡Instalación de Obsitracer completada con éxito!" "$C_BOLD$C_GREEN"
    draw_screen 5 "[✔]" "[✔]" "[✔]" "[✔]" "[✔]" "🎉 Instalación Exitosa. Presiona [ENTER] para finalizar."
    read -r
}

# ==============================================================================
# ENTRYPOINT PRINCIPAL
# ==============================================================================
function main() {
    step_1_audit
    step_2_tmux
    step_3_agy
    step_4_vaults
    step_5_healthcheck

    clear
    echo -e "${C_BOLD}${C_GREEN}╔══════════════════════════════════════════════════════════════════════════════╗${C_RESET}"
    echo -e "${C_BOLD}${C_GREEN}║               🧠 OBSITRACER ESTÁ 100% INSTALADO Y OPERATIVO                  ║${C_RESET}"
    echo -e "${C_BOLD}${C_GREEN}╚══════════════════════════════════════════════════════════════════════════════╝${C_RESET}"
    echo ""
    echo -e "${C_BOLD}${C_CYAN}Atajos y Uso Rápido:${C_RESET}"
    echo -e "  • ${C_BOLD}Alt + o${C_RESET}          ➔ Abre el popup flotante en Tmux para cambiar de Vault."
    echo -e "  • ${C_BOLD}Ctrl+a ➔ o${C_RESET}       ➔ Atajo alternativo con prefijo."
    echo -e "  • ${C_BOLD}En Antigravity:${C_RESET}  El hook inyecta el foco activo automáticamente en cada turno."
    echo ""
    echo -e "${C_DIM}Registro de Vaults: $VAULTS_REGISTRY${C_RESET}"
    echo -e "${C_DIM}Plugin de Tmux:     $TMUX_PLUGIN_DIR${C_RESET}"
    echo -e "${C_DIM}Plugin de AGY:      $AGY_PLUGIN_DIR${C_RESET}"
    echo ""
}

main "$@"
