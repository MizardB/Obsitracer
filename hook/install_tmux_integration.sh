#!/usr/bin/env bash
# hook/install_tmux_integration.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMUX_SCRIPTS_DIR="$HOME/.tmux/scripts"
TMUX_CONF="$HOME/.tmux.conf"
STYLE_CONF="$HOME/.tmux/modules/style.conf"
OBSITRACER_SCRIPT="$TMUX_SCRIPTS_DIR/obsitracer.sh"

echo "⚙️ Configurando integración de Obsitracer como Custom Plugin de Ukiyo..."

# 1. Crear el directorio de scripts si no existe
mkdir -p "$TMUX_SCRIPTS_DIR"

# 2. Copiar el script del widget desde el repositorio local
echo "Instalando script del widget en $OBSITRACER_SCRIPT..."
cp "$SCRIPT_DIR/obsitracer_widget.sh" "$OBSITRACER_SCRIPT"
chmod +x "$OBSITRACER_SCRIPT"

# 3. Limpiar la inyección antigua de .tmux.conf si existe
if grep -q "obsitracer.sh" "$TMUX_CONF"; then
    echo "Limpiando inyección standalone antigua en $TMUX_CONF..."
    sed -i '/--- Widgets Independientes ---/d' "$TMUX_CONF"
    sed -i '/obsitracer.sh/d' "$TMUX_CONF"
fi

# 4. Configurar style.conf para usar la API de plugins custom de Ukiyo
if [ -f "$STYLE_CONF" ]; then
    echo "Ajustando @ukiyo-plugins en $STYLE_CONF..."
    
    # Asegurarnos de limpiar cualquier mención anterior
    sed -i 's/ obsitracer//g' "$STYLE_CONF"
    sed -i 's/obsitracer //g' "$STYLE_CONF"
    sed -i 's/custom:[^ ]*//g' "$STYLE_CONF"
    
    # Reemplazar la línea entera de @ukiyo-plugins por la versión con custom:
    # Esto lo colocará justo antes de 'git' (master)
    sed -i "s|set -g @ukiyo-plugins .*|set -g @ukiyo-plugins \"custom:$OBSITRACER_SCRIPT git cpu-usage ram-usage\"|" "$STYLE_CONF"
    
    # Añadir el color custom para que haga juego con el tema (naranja estilo TokyoNight)
    if ! grep -q "ukiyo-custom-plugin-colors" "$STYLE_CONF"; then
        echo 'set -g @ukiyo-custom-plugin-colors "notice bg_pane"' >> "$STYLE_CONF"
    else
        sed -i 's/set -g @ukiyo-custom-plugin-colors .*/set -g @ukiyo-custom-plugin-colors "notice bg_pane"/' "$STYLE_CONF"
    fi
fi

# 5. Forzar latencia cero en cambios de panel
if ! grep -q "pane-focus-in" "$TMUX_CONF"; then
    echo "set-hook -g pane-focus-in 'refresh-client -S'" >> "$TMUX_CONF"
    echo "set-hook -g client-focus-in 'refresh-client -S'" >> "$TMUX_CONF"
fi

# 6. Forzar recarga de tmux
if tmux info &>/dev/null; then
    echo "🔄 Recargando tmux..."
    tmux source-file "$TMUX_CONF" || true
fi

echo "✅ Integración de Ukiyo completada exitosamente."
