#!/usr/bin/env bash
# ==============================================================================
# 🧠 Obsitracer - Interactive Vault Selector (fzf)
# ==============================================================================
set -eo pipefail

export PATH="$HOME/.nix-profile/bin:$HOME/.local/bin:$PATH"

PANE_ID="$1"
if [ -z "$PANE_ID" ]; then
    PANE_ID="${TMUX_PANE:-.}"
fi

VAULTS_FILE="$HOME/.config/obsitracer/vaults.json"

if [ ! -f "$VAULTS_FILE" ]; then
    tmux display-message "Obsitracer: No se encontró el registro de vaults ($VAULTS_FILE)"
    exit 0
fi

# Detectar target actual
CURRENT_TARGET=$(tmux show-option -p -t "$PANE_ID" -qv @obsitracer_target 2>/dev/null || true)
if [ -z "$CURRENT_TARGET" ]; then
    CURRENT_STR="Ninguno (Silenciado)"
else
    CURRENT_STR="$CURRENT_TARGET"
fi

# Preparar opciones
ENTRIES=$(jq -r '.[] | "\(.name)\t\(.path)"' "$VAULTS_FILE" 2>/dev/null || true)
if [ -z "$ENTRIES" ]; then
    tmux display-message "Obsitracer: No hay vaults registrados en vaults.json"
    exit 0
fi

HEADER_TEXT="Foco actual: $CURRENT_STR | [Enter] Seleccionar | [Esc] Cancelar"

ITEMS=$(printf "[✕] Silenciar / Apagar foco\t(Desactiva inyección de contexto)\n%s" "$ENTRIES")

SELECTED=$(echo "$ITEMS" | fzf \
    --prompt="🧠 Obsitracer > " \
    --header="$HEADER_TEXT" \
    --delimiter=$'\t' \
    --with-nth=1,2 \
    --color="header:italic:cyan,prompt:bold:yellow" \
    --height=100% \
    --reverse) || true

if [ -z "$SELECTED" ]; then
    exit 0
fi

if [[ "$SELECTED" == *"[✕]"* ]]; then
    tmux set-option -p -t "$PANE_ID" -u @obsitracer_target
    tmux display-message -t "$PANE_ID" "Obsitracer: Foco apagado en este panel"
else
    TARGET_NAME=$(echo "$SELECTED" | awk -F'\t' '{print $1}')
    tmux set-option -p -t "$PANE_ID" @obsitracer_target "$TARGET_NAME"
    tmux display-message -t "$PANE_ID" "Obsitracer: Foco sintonizado a [$TARGET_NAME]"
fi

# Forzar refresco de la barra de estado de Tmux
tmux refresh-client -S 2>/dev/null || true
