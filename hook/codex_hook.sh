#!/usr/bin/env bash
BASE_DIR="$HOME/.config/obsitracer"

# Read stdin into a variable (Codex sends JSON on stdin)
INPUT=$(cat)
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')

# 1. Resolución de Atención Dinámica (Tmux Window/Pane Local)
TARGET_VAULT=$(tmux show-option -p -t "${TMUX_PANE:-.}" -qv @obsitracer_target 2>/dev/null)
if [ -z "$TARGET_VAULT" ]; then
    TARGET_VAULT=$(tmux show-option -t "${TMUX_PANE:-.}" -qv @obsitracer_target 2>/dev/null)
fi

# 2. Silencio si no hay objetivo
if [ -z "$TARGET_VAULT" ]; then
    exit 0
fi

VAULT_DIR="$BASE_DIR/vaults/$TARGET_VAULT"
FOCUS_FILE="$VAULT_DIR/focus.json"
CRUD_FILE="$VAULT_DIR/crud.json"
LAST_FOCUS_FILE="$VAULT_DIR/last_injected_focus_codex.txt"

if [ ! -d "$VAULT_DIR" ] || [ ! -f "$FOCUS_FILE" ]; then
    exit 0
fi

# 3. Protocolo Anti-Spam
CURRENT_FOCUS_TS=$(jq -r '.ts' "$FOCUS_FILE" 2>/dev/null)
LAST_FOCUS_TS=""
if [ -f "$LAST_FOCUS_FILE" ]; then
    LAST_FOCUS_TS=$(cat "$LAST_FOCUS_FILE")
fi

HAS_NEW_FOCUS=0
if [ "$CURRENT_FOCUS_TS" != "$LAST_FOCUS_TS" ]; then
    HAS_NEW_FOCUS=1
fi

HAS_CRUD=0
PAYLOAD=""
if [ -f "$CRUD_FILE" ]; then
    CAMBIOS=$(jq -r '.changes | length' "$CRUD_FILE" 2>/dev/null || echo 0)
    if [ "$CAMBIOS" -gt 0 ]; then
        HAS_CRUD=1
        PAYLOAD=$(cat "$CRUD_FILE")
        # Vaciar el buzón
        echo '{"changes":[], "ia_blocks":[]}' > "$CRUD_FILE"
    fi
fi

if [ "$HAS_NEW_FOCUS" -eq 0 ] && [ "$HAS_CRUD" -eq 0 ]; then
    exit 0
fi

# Actualizar el tracker
echo "$CURRENT_FOCUS_TS" > "$LAST_FOCUS_FILE"

FOCUS_DATA=$(cat "$FOCUS_FILE")

# Construir el contexto
if [ "$HAS_CRUD" -eq 1 ]; then
    CONTEXTO="[OBSITRACER: VAULT ACTIVO -> $TARGET_VAULT]

📍 Foco Actual:
$FOCUS_DATA

🔄 Eventos Recientes (CRUD):
$PAYLOAD

Asimila esta información estructural y ejecuta cualquier bloque /ia() de inmediato."
else
    CONTEXTO="[OBSITRACER: VAULT ACTIVO -> $TARGET_VAULT]

📍 Foco Actual:
$FOCUS_DATA

No hay cambios estructurales (CRUD) recientes en este Vault."
fi

# Output expected by Codex
if [ -n "$HOOK_EVENT" ]; then
    jq -n --arg ctx "$CONTEXTO" --arg event "$HOOK_EVENT" '{
      "hookSpecificOutput": {
        "hookEventName": $event,
        "additionalContext": $ctx
      }
    }'
else
    # Default to UserPromptSubmit if event name is not available for some reason
    jq -n --arg ctx "$CONTEXTO" '{
      "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": $ctx
      }
    }'
fi
