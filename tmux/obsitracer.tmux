#!/usr/bin/env bash
# ==============================================================================
# 🧠 Obsitracer - Official Tmux Plugin Entrypoint
# ==============================================================================
set -euo pipefail

CURRENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCRIPTS_DIR="$CURRENT_DIR/scripts"

# 1. Registrar keybindings interactivos
# Alt + o (Directo sin prefijo)
tmux bind-key -n M-o display-popup -w 55% -h 35% -E "$SCRIPTS_DIR/obsitracer-select.sh"

# Prefix + O (Con prefijo, mayúscula para no colisionar con SessionX)
tmux bind-key O display-popup -w 55% -h 35% -E "$SCRIPTS_DIR/obsitracer-select.sh"

# 2. Auto-integración con tmux-ukiyo si está presente
UKIYO_PLUGINS=$(tmux show-option -gqv @ukiyo-plugins || true)
if [ -n "$UKIYO_PLUGINS" ]; then
    if [[ "$UKIYO_PLUGINS" != *"obsitracer.sh"* ]]; then
        tmux set-option -g @ukiyo-plugins "custom:$SCRIPTS_DIR/obsitracer.sh $UKIYO_PLUGINS"
    fi
    CUSTOM_COLORS=$(tmux show-option -gqv @ukiyo-custom-plugin-colors || true)
    if [ -z "$CUSTOM_COLORS" ]; then
        tmux set-option -g @ukiyo-custom-plugin-colors "notice bg_pane"
    fi
fi
