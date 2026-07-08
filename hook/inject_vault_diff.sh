#!/usr/bin/env bash
BASE_DIR="$HOME/.config/obsitracer"
FOCUS_FILE="$BASE_DIR/active_focus.json"

DEFAULT_MSG='{"injectSteps":[{"ephemeralMessage":"[OBSITRACER] Sistema inactivo o sin foco. No hay Vault activo actualmente."}]}'

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

# ==============================================================================
# ATENCIÓN SELECTIVA (PUNTO 3)
# Filtramos si la variable de entorno $OBSITRACER_VAULTS está definida en esta sesión.
# Ejemplo: export OBSITRACER_VAULTS="Academico,Memoria_Vault"
# ==============================================================================
if [ -n "$OBSITRACER_VAULTS" ]; then
    # Usamos grep para buscar el nombre exacto del vault en la lista separada por comas/espacios
    if ! echo "$OBSITRACER_VAULTS" | grep -Fqw "$VAULT_NAME"; then
        # El vault no está en la whitelist de esta sesión -> silenciamos el hook
        echo '{"injectSteps":[]}'
        exit 0
    fi
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
    CONTEXTO="[OBSITRACER: VAULT ACTIVO -> $VAULT_NAME]

📍 Foco Actual:
$FOCUS_DATA

🔄 Eventos Recientes (CRUD):
$PAYLOAD

Asimila esta información estructural y ejecuta cualquier bloque /ia() de inmediato."
else
    CONTEXTO="[OBSITRACER: VAULT ACTIVO -> $VAULT_NAME]

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
