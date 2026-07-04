#!/usr/bin/env bash
BASE_DIR="$HOME/.config/obsidian-copilot"
FOCUS_FILE="$BASE_DIR/active_focus.json"

DEFAULT_MSG='{"injectSteps":[{"ephemeralMessage":"[NOTIFICACIÓN DE MEMORIA-OS] Sistema inactivo o sin foco. No hay Vault activo actualmente."}]}'

if [ ! -f "$FOCUS_FILE" ]; then
    echo "$DEFAULT_MSG"
    exit 0
fi

# Extraer el nombre del Vault actual según el puntero de atención
VAULT_NAME=$(jq -r '.vault' "$FOCUS_FILE" 2>/dev/null)
if [ -z "$VAULT_NAME" ] || [ "$VAULT_NAME" == "null" ]; then
    echo "$DEFAULT_MSG"
    exit 0
fi

BUZON="$BASE_DIR/vaults/${VAULT_NAME}.json"
FOCUS_DATA=$(cat "$FOCUS_FILE")

PAYLOAD=""
if [ -f "$BUZON" ]; then
    CAMBIOS=$(jq -r '.changes | length' "$BUZON" 2>/dev/null || echo 0)
    if [ "$CAMBIOS" -gt 0 ]; then
        PAYLOAD=$(cat "$BUZON")
        # Vaciar el buzón CRUD del Vault activo
        echo '{"changes":[], "ia_blocks":[]}' > "$BUZON"
    fi
fi

if [ -n "$PAYLOAD" ]; then
    CONTEXTO="[ATENCIÓN: VAULT ACTIVO -> $VAULT_NAME]

📍 Foco Actual:
$FOCUS_DATA

🔄 Eventos Recientes (CRUD):
$PAYLOAD

Asimila esta información estructural y ejecuta cualquier bloque /ia() de inmediato."
else
    CONTEXTO="[ATENCIÓN: VAULT ACTIVO -> $VAULT_NAME]

📍 Foco Actual:
$FOCUS_DATA

No hay cambios estructurales (CRUD) recientes en este Vault."
fi

jq -n --arg ctx "$CONTEXTO" '{
  "injectSteps": [
    {
      "ephemeralMessage": $ctx
    }
  ]
}'
