#!/usr/bin/env bash
# ==============================================================================
# 🧠 Obsitracer - Official Tmux Plugin Entrypoint
# ==============================================================================
set -euo pipefail

CURRENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCRIPTS_DIR="$CURRENT_DIR/scripts"

# Registrar keybindings interactivos
# Alt + o (Directo sin prefijo)
tmux bind-key -n M-o display-popup -w 65% -h 40% -E "$SCRIPTS_DIR/obsitracer-select.sh '#{pane_id}'"

# Prefix + o (Opcional con prefijo)
tmux bind-key o display-popup -w 65% -h 40% -E "$SCRIPTS_DIR/obsitracer-select.sh '#{pane_id}'"
