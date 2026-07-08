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

Obsitracer se integra de forma modular con tu barra de estado de tmux (usando el tema `tmux-kanagawa`). Muestra un icono de gafas (`👓`) seguido del Vault de Obsidian que está siendo trackeado en el panel/ventana activa.

### Activación y Foco local
Para sintonizar la atención a un Vault específico desde un panel de tmux:
```bash
# Sintonizar foco a un Vault
tmux set-option @obsitracer_target "Memoria_Vault"

# Apagar el foco en el panel
tmux set-option -u @obsitracer_target
```
*Nota: También puedes usar la skill `obsitracer-operator` desde Antigravity para delegar esta sintonización automáticamente.*

### Personalización de Colores (ej. Rojo)
Por defecto, el bloque se instala con fondo rojo y texto oscuro (`red bg_pane`). Si deseas cambiar el color o su comportamiento, edita tu archivo de estilos de tmux:
```tmux
# En ~/.tmux/modules/style.conf (o tu archivo de configuración de tmux):
set -g @ukiyo-obsitracer-colors "red bg_pane"  # Fondo rojo, texto oscuro
# O para fondo oscuro y texto rojo:
# set -g @ukiyo-obsitracer-colors "bg_pane red"
```

## Ubicación de las Configuraciones

Aquí tienes el mapa de archivos de configuración del sistema:

1. **Configuración de Tmux:**
   - **Archivo raíz:** [~/.tmux.conf](file:///home/manzen/.tmux.conf) (Modular).
   - **Estilos y Plugins:** [~/.tmux/modules/style.conf](file:///home/manzen/.tmux/modules/style.conf) (Donde se define el orden de la barra de estado y los colores).
   - **Scripts del Tema:** [~/.tmux/plugins/tmux-kanagawa/scripts/](file:///home/manzen/.tmux/plugins/tmux-kanagawa/scripts/) (Contiene el resolvedor [obsitracer.sh](file:///home/manzen/.tmux/plugins/tmux-kanagawa/scripts/obsitracer.sh) y el orquestador [ukiyo.sh](file:///home/manzen/.tmux/plugins/tmux-kanagawa/scripts/ukiyo.sh)).
2. **Configuración Global de Obsitracer (Antigravity):**
   - **Hooks de Invocación:** [~/.gemini/config/hooks.json](file:///home/manzen/.gemini/config/hooks.json) (Registra el script inyector de diffs).
   - **Skill de Atención:** [~/.gemini/skills/obsitracer-operator/SKILL.md](file:///home/manzen/.gemini/skills/obsitracer-operator/SKILL.md) (Define cómo Antigravity manipula tmux).
3. **Estado de Vaults:**
   - **Registro Global:** [~/.config/obsitracer/vaults.json](file:///home/manzen/.config/obsitracer/vaults.json) (Mapea los nombres de vaults a sus rutas absolutas).
   - **Buzones Temporales (CRUD/Foco):** En `~/.config/obsitracer/vaults/{NombreVault}/` (donde `focus.json` y `crud.json` se actualizan reactivamente).

