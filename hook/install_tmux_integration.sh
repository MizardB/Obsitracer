#!/usr/bin/env bash
# hook/install_tmux_integration.sh
set -euo pipefail

KANAGAWA_DIR="$HOME/.tmux/plugins/tmux-kanagawa"
STYLE_CONF="$HOME/.tmux/modules/style.conf"

echo "⚙️ Configurando integración de Obsitracer en tmux..."

# 1. Modificar ukiyo.sh para registrar el caso del plugin 'obsitracer'
if [ -d "$KANAGAWA_DIR" ]; then
    UKIYO_SCRIPT="$KANAGAWA_DIR/scripts/ukiyo.sh"
    if ! grep -q 'elif \[ \$plugin = "obsitracer" \]; then' "$UKIYO_SCRIPT"; then
        echo "Inyectando plugin 'obsitracer' en ukiyo.sh..."
        # Insertar el bloque de configuración justo antes de la cláusula de 'weather'
        sed -i '/elif \[ \$plugin = "weather" \]; then/i \    elif [ $plugin = "obsitracer" ]; then\n      IFS='\'' '\'' read -r -a colors <<<$(get_tmux_option "@ukiyo-obsitracer-colors" "accent bg_pane")\n      script="#($current_dir/obsitracer.sh)"\n' "$UKIYO_SCRIPT"
    fi
    
    # 2. Reemplazar obsitracer.sh para leer la variable de atención del pane activo con el icono de gafas
    echo "Configurando obsitracer.sh con el target local..."
    cat << 'EOF' > "$KANAGAWA_DIR/scripts/obsitracer.sh"
#!/usr/bin/env bash
# Obsitracer status line renderer (眼鏡 / Gafas tracking)

TARGET=$(tmux display-message -p -F "#{@obsitracer_target}" 2>/dev/null)

if [ -n "$TARGET" ]; then
  echo "👓 $TARGET"
else
  echo "👓 --"
fi
EOF
    chmod +x "$KANAGAWA_DIR/scripts/obsitracer.sh"
else
    echo "⚠️ No se detectó instalación de tmux-kanagawa en $KANAGAWA_DIR"
fi

# 3. Asegurar que 'obsitracer' esté configurado en el style.conf
if [ -f "$STYLE_CONF" ]; then
    if ! grep -q 'obsitracer' "$STYLE_CONF"; then
        echo "Añadiendo obsitracer a la lista de plugins en style.conf..."
        sed -i 's/\@kanagawa-plugins "/\@kanagawa-plugins "obsitracer /' "$STYLE_CONF"
    fi
fi

# 4. Forzar recarga de tmux
if tmux info &>/dev/null; then
    echo "🔄 Recargando tmux..."
    tmux source-file "$HOME/.tmux.conf" || true
fi

echo "✅ Integración de tmux completada."
