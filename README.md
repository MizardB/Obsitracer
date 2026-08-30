# Obsitracer

> Cognitive Tracking & Real-Time Context Orchestrator  
> Conexión contextual pasiva y en tiempo real entre Obsidian, Tmux y tu agente de Inteligencia Artificial.

---

## El Problema

Obsidian es una de las herramientas más potentes para construir un segundo cerebro, documentar sistemas y gestionar conocimiento. Sin embargo, al colaborar con agentes de Inteligencia Artificial en la terminal (como Antigravity / Gemini CLI), la experiencia actual sufre de fricción constante:

1. **La IA es ciega a tu contexto activo:** Si estás editando una nota o explorando un diagrama, el agente no sabe qué estás viendo. Tienes que copiar y pegar fragmentos manualmente o redactar prompts explicativos largos solo para ubicarlo (*"mira el archivo X dentro de la carpeta Y..."*).
2. **RAG estático y costoso:** Los sistemas tradicionales de búsqueda o RAG leen archivos en bloque, consumen miles de tokens de contexto innecesarios y sufren de desfase con respecto a lo que acabas de escribir hace 5 segundos.
3. **Falta de tacto:** La IA no tiene noción física de tu navegación: no sabe si cambiaste de archivo, en qué línea tienes puesto el cursor ni qué notas acabas de crear en tu sesión actual.

---

## La Solución: Darle Tacto a la IA

Obsitracer elimina por completo esta fricción otorgándole **presencia contextual pasiva** a tu agente:

* **Rastreo Reactivo:** Un plugin ligero en TypeScript monitorea en segundo plano tu nota activa, la posición exacta del cursor (línea y columna) y las operaciones CRUD de archivos en tu Vault.
* **Inyección Pre-Turno (< 2ms):** Justo antes de que el agente procese tu mensaje en la terminal, un hook en Go evalúa el delta de cambios y le inyecta a la IA únicamente lo que acaba de cambiar en tu editor.
* **Cero Desperdicio de Tokens:** Si no tocaste nada en Obsidian entre turnos, el sistema no inyecta datos redundantes. Si cambiaste de nota o modificaste un párrafo, el agente lo sabe al instante sin que tengas que mencionarlo.
* **Control Visual en Tmux:** Eliges qué Vault está sintonizado en cada panel de terminal mediante un popup flotante accesible con `Alt + o` y visualizas el archivo activo directamente en tu barra de estado.

---

## Requisitos del Sistema

Antes de instalar Obsitracer, asegúrate de contar con los siguientes componentes:

| Componente | Requisito Mínimo | Propósito |
| :--- | :--- | :--- |
| **Sistema Operativo** | Linux (NixOS, Arch, Ubuntu, Fedora, etc.) o macOS | Soporte de sockets y llamadas atómicas POSIX. |
| **Obsidian** | v1.5.0 o superior | Entorno de notas con la opción *Community Plugins* habilitada. |
| **Tmux** | v3.2 o superior | Manejo de paneles de terminal, popup interactivo (`Alt + o`) y widgets. |
| **Antigravity CLI / AGY** | v1.0.0 o superior | Agente de IA que consume el hook `PreInvocation`. |
| **Entorno de Compilación** | **Nix Flakes** (Recomendado) o **Go 1.22+ y Node/esbuild** | Compilación hermética e instalación de binarios. |

---

## Instalación Rápida

### Opción 1: Con Nix Flakes (Recomendado)

Si utilizas Nix, ejecuta el orquestador interactivo en un entorno hermético:

```bash
nix run
```

Este comando:
1. Compila automáticamente el motor en Go (`obsitracer`).
2. Empaqueta el plugin de TypeScript con `esbuild`.
3. Crea el enlace simbólico global en `~/.local/bin/obsitracer`.
4. Abre la interfaz TUI para seleccionar tus Vaults y configurar Tmux y Antigravity en vivo.

---

### Opción 2: Compilación Manual con Go

Si prefieres compilar de forma nativa:

```bash
# 1. Clonar el repositorio
git clone https://github.com/MizardB/Obsitracer.git
cd Obsitracer

# 2. Compilar el plugin de Obsidian
cd obsitracer
npm install
npm run build
cd ..

# 3. Compilar el CLI de Go
go build -ldflags="-s -w" -o bin/obsitracer ./cmd/obsitracer

# 4. Crear enlace simbólico en tu PATH
ln -sf "$(pwd)/bin/obsitracer" ~/.local/bin/obsitracer

# 5. Ejecutar el asistente de instalación interactivo
obsitracer install
```

---

## Manual de Uso Diario

El flujo de trabajo con Obsitracer está diseñado para ser completamente transparente:

### 1. Trabaja en Obsidian con normalidad
Abre tu Vault en Obsidian y escribe, crea notas, renombra archivos o navega por tu estructura. El plugin registrará internamente tus movimientos con debouncing de baja latencia sin interferir con el rendimiento del editor.

### 2. Sintoniza el Vault en tu terminal
En cualquier panel de Tmux donde vayas a interactuar con tu asistente:
* Presiona `Alt + o` para abrir el selector flotante.
* Usa las flechas para elegir el Vault que deseas conectar a ese panel y presiona `Enter`.
* Para salir sin hacer cambios, presiona `Esc` o `q`.
* Para desactivar la atención en ese panel, selecciona `[✕] Silenciar / Apagar foco`.

En la barra de estado de Tmux aparecerá de inmediato el indicador en vivo:
```text
[👓 MiVault/NotaActiva.md]
```

### 3. Habla con tu agente de IA
Abre tu agente en la terminal (`agy`) y hazle cualquier consulta directa. Por ejemplo:
* *"¿Cómo resumirías lo que acabo de redactar?"*
* *"Corrige la sintaxis del bloque de código que tengo abierto."*
* *"Genera las conclusiones a partir de los puntos que escribí arriba."*

El agente ya sabrá en qué archivo estás, en qué línea tienes puesto el cursor y qué notas modificaste recientemente, respondiendo con contexto preciso y sin preámbulos.

---

## Comandos del CLI (`obsitracer`)

El binario global `obsitracer` provee utilidades directas para scripts, atajos y diagnóstico:

| Comando | Descripción |
| :--- | :--- |
| `obsitracer` / `obsitracer install` | Abre el instalador interactivo TUI para vincular o actualizar Vaults. |
| `obsitracer status` | Muestra el estado del sistema, Vaults registrados y la nota activa en tiempo real. |
| `obsitracer select` | Lanza el selector flotante TUI en el panel actual de Tmux. |
| `obsitracer target <vault_name>` | Sintoniza directamente el panel actual al Vault indicado. |
| `obsitracer clear` | Apaga y silencia la inyección de contexto en el panel actual. |
| `obsitracer widget` | Genera la salida formateada del badge para la status bar de Tmux. |
| `obsitracer hook` | Ejecuta el hook PreInvocation consumido internamente por el agente de IA. |

---

## Atajos de Teclado en Tmux

| Atajo | Acción |
| :--- | :--- |
| `Alt + o` | Abre el selector interactivo flotante de Vaults en el panel activo. |
| `Prefix + O` | Atajo secundario con prefijo de Tmux (`Ctrl+a -> O` / `Ctrl+b -> O`). |
| `Esc` / `q` | Cancela y cierra el selector flotante conservando el foco actual. |

---

## Filosofía del Proyecto y Contribuciones

Obsitracer es un proyecto *opinionated* de autor, concebido y optimizado para flujos de trabajo terminal-first de alta eficiencia:
* **Entorno principal:** Linux / NixOS con Tmux.
* **Agente AI objetivo:** Antigravity / Gemini CLI (mediante hooks PreInvocation).
* **Frontend de notas:** Obsidian.

### Contribuciones y Pull Requests
Las contribuciones de la comunidad son bienvenidas, especialmente en:
* Soporte e integraciones con nuevos agentes de IA por terminal.
* Optimizaciones en el bundle y ciclo de eventos del plugin de Obsidian.
* Correcciones de bugs y compatibilidad con otros entornos POSIX.

**Requisitos para Pull Requests:**
1. **Conventional Commits:** Todo commit debe seguir el estándar (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
2. **Revisión Asistida:** Los Pull Requests se evalúan y prueban de forma asíncrona mediante workflows de auditoría con IA antes de integrarse en la rama principal.

---

## Licencia

Este proyecto está distribuido bajo la licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.


