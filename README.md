# Obsitracer

Plugin de Obsidian + sistema de tracking cognitivo que alimenta a Antigravity con contexto en tiempo real sobre qué vault y nota tiene el usuario en foco.

## Componentes
- `obsitracer/` — Plugin de Obsidian: trackea cursor, foco y CRUD. Empuja el foco activo a tmux vía canal reactivo.
- `plugins/obsitracer/` — Plugin oficial de Antigravity (Hook PreInvocation + Skill `obsitracer-operator`).
- `tmux/` — Widget para la barra de estado de Tmux.
- `install.sh` / `Makefile` — Orquestador de instalación, build y vinculación de vaults.

## Instalación
```bash
# En NixOS / Flakes (ejecuta el instalador con todas las dependencias aisladas)
nix run

# Menú interactivo tradicional
bash install.sh

# O directamente vía Make:
make install OBSIDIAN_VAULT="/ruta/a/tu/vault"
make install-hook-agy
```

## tmux & Atención Dinámica

Obsitracer se integra de forma modular con tu barra de estado de tmux. La integración actual **depende visualmente del plugin `tmux-ukiyo`** (utilizando su API oficial de *Custom Plugins*). Esto permite que el widget herede el espaciado, los divisores y la paleta de colores del tema activo (ej. *TokyoNight*), ubicándose de forma nativa en la barra (por ejemplo, junto al módulo de git).

- **El script lógico** es independiente y reside en `~/.tmux/scripts/obsitracer.sh`. Este archivo es enlazado automáticamente por el instalador desde `tmux/obsitracer_widget.sh`.
- **El renderizado visual** se delega a Ukiyo en tu configuración de estilos (ej. `~/.tmux/modules/style.conf`) insertando la ruta vía `custom:/ruta/al/script`.

*(Nota arquitectónica: Si decides cambiar de motor de temas y abandonar Ukiyo, el widget dejará de renderizarse. En ese escenario, se requerirá refactorizar el instalador o forzar la inyección nativa con `set -ag status-right`).*

### Activación y Foco local
Para sintonizar la atención a un Vault específico desde un panel de tmux:
```bash
# Sintonizar foco a un Vault
tmux set-option -p @obsitracer_target "MemorIA"

# Apagar el foco en el panel
tmux set-option -p -u @obsitracer_target
```
*Nota: También puedes usar la skill `obsitracer-operator` desde Antigravity para delegar esta sintonización automáticamente.*

### Personalización de Colores (TokyoNight)
El color del widget se maneja a través de las variables de colores custom de Ukiyo. Por ejemplo, para usar el color naranja (`notice` en TokyoNight):
```tmux
# En ~/.tmux/modules/style.conf (o tu archivo de configuración de tmux):
set -g @ukiyo-custom-plugin-colors "notice bg_pane"
```

## Ubicación de las Configuraciones

Aquí tienes el mapa de archivos de configuración del sistema:

1. **Configuración de Tmux:**
   - **Archivo raíz:** [~/.tmux.conf](file:///home/manu/.tmux.conf) (Modular).
   - **Estilos y Plugins:** [~/.tmux/modules/style.conf](file:///home/manu/.tmux/modules/style.conf) (Donde se inyecta la variable `@ukiyo-plugins` para cargar el widget de forma dinámica).
   - **Script del Widget:** [~/.tmux/scripts/obsitracer.sh](file:///home/manu/.tmux/scripts/obsitracer.sh) (Enlazado a `tmux/obsitracer_widget.sh`).
2. **Configuración del Plugin Antigravity:**
   - **Plugin instalado:** [~/.gemini/antigravity-cli/plugins/obsitracer](file:///home/manu/.gemini/antigravity-cli/plugins/obsitracer)
   - **Hook PreInvocation:** [plugins/obsitracer/hooks.json](file:///home/manu/Documents/repositorios/Obsitracer/plugins/obsitracer/hooks.json)
   - **Skill de Atención:** [plugins/obsitracer/skills/obsitracer-operator/SKILL.md](file:///home/manu/Documents/repositorios/Obsitracer/plugins/obsitracer/skills/obsitracer-operator/SKILL.md)
3. **Estado de Vaults:**
   - **Registro Global:** [~/.config/obsitracer/vaults.json](file:///home/manu/.config/obsitracer/vaults.json) (Mapea los nombres de vaults a sus rutas absolutas).
   - **Buzones Temporales (CRUD/Foco):** En `~/.config/obsitracer/vaults/{NombreVault}/` (donde `focus.json` y `crud.json` se actualizan reactivamente).

