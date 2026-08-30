#!/usr/bin/env bash
# ==============================================================================
# 🧠 Obsitracer - Interactive Vault Selector (Go CLI + Charm)
# ==============================================================================
export PATH="$HOME/.local/bin:$HOME/.nix-profile/bin:$PATH"

PANE_ID="$1"
if [ -z "$PANE_ID" ] || [ "$PANE_ID" = "#{pane_id}" ]; then
    PANE_ID=$(tmux display-message -p -F "#{pane_id}" 2>/dev/null || echo ".")
fi

# 1. Intentar con CLI unificado en Go (Huh / Charm)
if command -v obsitracer >/dev/null 2>&1; then
    exec obsitracer select -p "$PANE_ID"
fi

# 2. Fallback binario local
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ -x "$SCRIPT_DIR/../../bin/obsitracer" ]; then
    exec "$SCRIPT_DIR/../../bin/obsitracer" select -p "$PANE_ID"
fi

# 3. Fallback fzf si el binario no está en PATH
VAULTS_FILE="$HOME/.config/obsitracer/vaults.json"
if [ ! -f "$VAULTS_FILE" ]; then
    tmux display-message "Obsitracer: No se encontró el registro de vaults ($VAULTS_FILE)"
    exit 0
fi

ENTRIES=$(jq -r '.[] | "📁 \(.name)\t(\(.path))"' "$VAULTS_FILE" 2>/dev/null || true)
if [ -z "$ENTRIES" ]; then
    tmux display-message "Obsitracer: No hay vaults registrados en vaults.json"
    exit 0
fi

CURRENT_TARGET=$(tmux show-option -p -t "$PANE_ID" -qv @obsitracer_target 2>/dev/null || true)
CURRENT_STR="${CURRENT_TARGET:-Ninguno (Silenciado)}"
HEADER_TEXT="Foco actual: $CURRENT_STR  •  [Enter] Sintonizar  •  [Ctrl-X] Silenciar  •  [Esc] Salir"

ITEMS=$(printf "[✕] Silenciar / Apagar foco\t(Desactiva inyección de contexto)\n%s" "$ENTRIES")

SELECTED=$(echo "$ITEMS" | fzf \
    --prompt="🧠 Obsitracer > " \
    --header="$HEADER_TEXT" \
    --expect=ctrl-x \
    --delimiter=$'\t' \
    --with-nth=1,2 \
    --color="header:italic:cyan,prompt:bold:yellow,pointer:bold:green" \
    --height=100% \
    --reverse) || true

if [ -z "$SELECTED" ]; then
    exit 0
fi

KEY=$(echo "$SELECTED" | head -n1)
LINE=$(echo "$SELECTED" | tail -n1)

if [ "$KEY" = "ctrl-x" ] || [[ "$LINE" == *"[✕]"* ]]; then
    tmux set-option -p -t "$PANE_ID" -u @obsitracer_target
    tmux display-message -t "$PANE_ID" "Obsitracer: Foco apagado en este panel"
else
    TARGET_NAME=$(echo "$LINE" | awk -F'\t' '{print $1}' | sed 's/📁 //; s/^[[:space:]]*//; s/[[:space:]]*$//')
    if [ -n "$TARGET_NAME" ]; then
        tmux set-option -p -t "$PANE_ID" @obsitracer_target "$TARGET_NAME"
        tmux display-message -t "$PANE_ID" "Obsitracer: Foco sintonizado a [$TARGET_NAME]"
    fi
fi

tmux refresh-client -S 2>/dev/null || true
