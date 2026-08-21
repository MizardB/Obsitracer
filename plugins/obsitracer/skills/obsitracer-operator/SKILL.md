---
name: obsitracer-operator
description: Permite al agente redirigir su foco de atención a diferentes vaults de Obsidian de forma dinámica mediante comandos de tmux, usando un mapeo inteligente a partir de la lista global de vaults activos.
---

# Obsitracer Operator

Esta skill te enseña a manejar dinámicamente tu foco de atención entre los diferentes Vaults de Obsidian del usuario. 

---

## Reglas de Operación

### 1. Cuándo activar esta Skill
Activa esta lógica inmediatamente cuando el usuario exprese intenciones de cambiar, enfocar o apagar el foco de atención de Obsidian. Ejemplos:
- *"agy, mira mi vault academico"*
- *"enfoca en memoria"*
- *"cambia al vault de copilot"*
- *"limpia el foco / vuelve al modo global"*

### 2. Mapeo Inteligente del Vault (Descubrimiento)
Antes de setear la variable, debes saber cómo se llama exactamente el Vault (sensible a mayúsculas/espacios). 
1. Lee el archivo global de registro: `~/.config/obsitracer/vaults.json` (formato JSON array de objetos `{ name, path }`).
2. Compara el texto del usuario contra la lista. Si el usuario escribe "acad", tú debes mapearlo a "Academico". Si escribe "memoria", a "Memoria_Vault".
3. Si no encuentras una coincidencia clara, pídele amablemente al usuario que te diga el nombre exacto de la lista de vaults registrados.

### 3. Modificación del Foco en Tmux (Acción)
Una vez resuelto el `VAULT_NAME` exacto:
1. Ejecuta el comando de shell para setear el target local al panel actual:
   ```bash
   tmux set-option -p -t "${TMUX_PANE:-.}" @obsitracer_target "VAULT_NAME"
   ```
2. Confirma la acción al usuario diciendo: *"Sintonizando atención dinámica a [VAULT_NAME]..."*.
3. El cambio tomará efecto en el **siguiente turno** del usuario (cuando el hook corra de nuevo).

### 4. Apagar / Limpiar el Foco
Si el usuario te pide volver al comportamiento global (o simplemente limpiar la atención de esa terminal):
1. Elimina la opción local usando el flag `-u` (unset) y `-p` (panel):
   ```bash
   tmux set-option -p -t "${TMUX_PANE:-.}" -u @obsitracer_target
   ```
2. Confirma la acción al usuario diciendo: *"Atención dinámica apagada en esta ventana. Hook silenciado."*.
