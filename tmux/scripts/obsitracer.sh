#!/usr/bin/env bash
# ==============================================================================
# 🧠 Obsitracer - Tmux Status Bar Widget (Go CLI)
# ==============================================================================
export PATH="$HOME/.local/bin:$HOME/.nix-profile/bin:$PATH"

if command -v obsitracer >/dev/null 2>&1; then
    exec obsitracer widget
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ -x "$SCRIPT_DIR/../../bin/obsitracer" ]; then
    exec "$SCRIPT_DIR/../../bin/obsitracer" widget
fi

# Fallback bash rápido
PANE_CMD=$(tmux display-message -p -F "#{pane_current_command}" 2>/dev/null || true)
if [[ "$PANE_CMD" != *"agy"* ]]; then
    echo -n ""
    exit 0
fi

TARGET_VAULT=$(tmux display-message -p -F "#{@obsitracer_target}" 2>/dev/null || true)
if [ -n "$TARGET_VAULT" ]; then
    echo "👓 $TARGET_VAULT"
fi
