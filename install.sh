#!/usr/bin/env bash
# ==============================================================================
# 🧠 OBSITRACER MASTER ORCHESTRATOR & INSTALLER (UNIFIED GO CLI)
# ==============================================================================
set -eo pipefail
export PATH="$HOME/.local/bin:$HOME/.nix-profile/bin:$PATH"

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Compilar binario si no existe o si se ejecuta dentro del entorno
if [ ! -f "$REPO_DIR/bin/obsitracer" ]; then
    echo "Compilando CLI unificado de Obsitracer en Go..."
    (cd "$REPO_DIR" && go build -ldflags="-s -w" -o bin/obsitracer ./cmd/obsitracer)
fi

if [ -x "$REPO_DIR/bin/obsitracer" ]; then
    exec "$REPO_DIR/bin/obsitracer" install
fi

echo "Error: No se pudo compilar o ejecutar bin/obsitracer"
exit 1
