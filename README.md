# Obsitracer

Plugin de Obsidian + sistema de tracking cognitivo que alimenta a Antigravity con contexto en tiempo real sobre qué vault y nota tiene el usuario en foco.

## Componentes
- `obsitracer/` — Plugin de Obsidian: trackea cursor, foco y CRUD. Empuja el foco activo a tmux vía canal reactivo.
- `hook/` — Hook de Antigravity (PreInvocation): inyecta el contexto del vault activo como mensaje efímero al agente.
- `install.sh` / `Makefile` — Orquestador de instalación, build y vinculación de vaults.

## Instalación
```bash
# Menú interactivo
bash install.sh

# O directamente:
make install OBSIDIAN_VAULT="/ruta/a/tu/vault"
make install-hook
```

## tmux & Atención Dinámica

Obsitracer se integra de forma modular con tu barra de estado de tmux. La integración actual **depende visualmente del plugin `tmux-ukiyo`** (utilizando su API oficial de *Custom Plugins*). Esto permite que el widget herede el espaciado, los divisores y la paleta de colores del tema activo (ej. *TokyoNight*), ubicándose de forma nativa en la barra (por ejemplo, junto al módulo de git).

- **El script lógico** es independiente y reside en `~/.tmux/scripts/obsitracer.sh`. Este archivo es copiado automáticamente por el instalador.
- **El renderizado visual** se delega a Ukiyo en tu configuración de estilos (ej. `~/.tmux/modules/style.conf`) insertando la ruta vía `custom:/ruta/al/script`.

*(Nota arquitectónica: Si decides cambiar de motor de temas y abandonar Ukiyo, el widget dejará de renderizarse. En ese escenario, se requerirá refactorizar el instalador o forzar la inyección nativa con `set -ag status-right`).*

### Activación y Foco local
Para sintonizar la atención a un Vault específico desde un panel de tmux:
```bash
# Sintonizar foco a un Vault
tmux set-option @obsitracer_target "Memoria_Vault"

# Apagar el foco en el panel
tmux set-option -u @obsitracer_target
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
   - **Archivo raíz:** [~/.tmux.conf](file:///home/manzen/.tmux.conf) (Modular).
   - **Estilos y Plugins:** [~/.tmux/modules/style.conf](file:///home/manzen/.tmux/modules/style.conf) (Donde se inyecta la variable `@ukiyo-plugins` para cargar el widget de forma dinámica).
   - **Script del Widget:** [~/.tmux/scripts/obsitracer.sh](file:///home/manzen/.tmux/scripts/obsitracer.sh) (Lógica independiente extraída por el instalador).
2. **Configuración Global de Obsitracer (Antigravity):**
   - **Hooks de Invocación:** [~/.gemini/config/hooks.json](file:///home/manzen/.gemini/config/hooks.json) (Registra el script inyector de diffs).
   - **Skill de Atención:** [~/.gemini/skills/obsitracer-operator/SKILL.md](file:///home/manzen/.gemini/skills/obsitracer-operator/SKILL.md) (Define cómo Antigravity manipula tmux).
3. **Estado de Vaults:**
   - **Registro Global:** [~/.config/obsitracer/vaults.json](file:///home/manzen/.config/obsitracer/vaults.json) (Mapea los nombres de vaults a sus rutas absolutas).
   - **Buzones Temporales (CRUD/Foco):** En `~/.config/obsitracer/vaults/{NombreVault}/` (donde `focus.json` y `crud.json` se actualizan reactivamente).

