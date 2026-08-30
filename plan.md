# 🗺️ Master Plan: Instalador TUI y Arquitectura Desacoplada de Obsitracer

Este documento define la especificación técnica y el diseño del instalador TUI de **Obsitracer**, así como la arquitectura modular que desacopla la integración de Tmux de los dotfiles del usuario.

---

## 🎯 Objetivos Principales

1. **Instalador TUI Moderno (Split-Screen):** Panel dual interactivo (izquierda: flujo guiado paso a paso; derecha: panel de estado, telemetría y logs en tiempo real).
2. **Plugin Autónomo de Tmux:** Obsitracer se instala en `~/.tmux/plugins/obsitracer/` como un plugin estándar independiente de MizarOS.
3. **Despliegue Limpio en Antigravity:** Compilación de Go (`obsitracer-hook`) e instalación autocontenida de hooks y skills.
4. **Descubrimiento y Multi-Selección de Vaults:** Escaneo automático de `~/Documents` buscando carpetas `.obsidian`, selección interactiva con `Tab`/`Space` y modal de confirmación.
5. **Healthcheck y Auto-Activación:** Verificación integral de funcionamiento antes de finalizar.

---

## 🖥️ Diseño de la Interfaz TUI (Split Layout)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  🧠 OBSITRACER ORCHESTRATOR & INSTALLER                                v1.2.0           │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│  PROCESO DE INSTALACIÓN                   │  TELEMETRÍA Y ESTADO EN VIVO               │
│                                           │                                            │
│  [✔] 1. Auditoría del Entorno             │  [OK] Nix / DevShell detectado             │
│  [✔] 2. Plugin de Tmux (Autónomo)         │  [OK] Go v1.23 & Node v20 listos           │
│  [▶] 3. Plugin de Antigravity (AGY)       │  [OK] Tmux Server detectado (socket activo)│
│  [ ] 4. Scan y Multi-Selección de Vaults  │  ----------------------------------------  │
│  [ ] 5. Verificación y Healthcheck        │  [BUILD] Compilando obsitracer-hook (Go)...│
│                                           │  [INFO] Destino: ~/.gemini/.../plugins/    │
│  ---------------------------------------  │  [STATUS] Hook compilado exitosamente.     │
│  Acción: Presiona [ENTER] para compilar   │                                            │
│          o [ESC] para cancelar.           │                                            │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 🔄 Flujo de Trabajo y Fases de Instalación

```text
  [ install.sh / nix run ]
             │
             ▼
   [ 1. Auditoría de Entorno ] ──(Falta binario)──> [ Alerta en Panel Derecho + Guía ]
             │ (OK)
             ▼
   [ 2. Instalar Plugin Tmux ] ────> Crea ~/.tmux/plugins/obsitracer/
             │ (OK)
             ▼
   [ 3. Build & Instalar AGY ] ────> Compila Go (obsitracer-hook) + Vincula en AGY
             │ (OK)
             ▼
   [ 4. Scanner de Vaults ] ───────> Busca ~/.obsidian en ~/Documents
             │
             ▼
   [ Multi-select (Tab/Space) ] ───> Modal de confirmación con lista de Vaults
             │ (Confirmado)
             ▼
   [ 5. Healthcheck & Activación ] ─> Verifica buzones, recarga Tmux y listo
```

---

## 📋 Especificación Técnica por Fase

### Fase 1: Auditoría del Entorno y Dependencias
- **Propósito:** Validar que el sistema cuenta con las herramientas necesarias sin romper la ejecución.
- **Acciones:**
  - Detectar si se está ejecutando bajo `nix run` o entorno nativo.
  - Verificar: `tmux`, `fzf`, `jq`, `node`, `esbuild`, `go`.
  - Si falta alguna dependencia fuera de Nix, el panel derecho muestra la advertencia y las instrucciones de remediación.

### Fase 2: Plugin Autónomo de Tmux
- **Propósito:** Eliminar cualquier acoplamiento con repositorios locales de desarrollo.
- **Ubicación de destino:** `~/.tmux/plugins/obsitracer/`
- **Estructura interna del plugin:**
  - `obsitracer.tmux`: Punto de entrada ejecutable que registra automáticamente los keybindings (`Alt+o` y `Prefix+o`) de forma agnóstica a la ruta.
  - `scripts/obsitracer.sh`: Widget para la barra de estado.
  - `scripts/obsitracer-select.sh`: Selector interactivo flotante con `fzf`.
- **Efecto:** Si Tmux está en ejecución, enviar `tmux source-file` automático para que los atajos queden listos al instante.

### Fase 3: Build & Despliegue en Antigravity (AGY)
- **Propósito:** Empaquetar el motor de alta velocidad y registrar las capacidades cognitivas en el agente.
- **Acciones:**
  1. Compilar el plugin de Obsidian: `cd obsitracer && esbuild main.ts --bundle ...`
  2. Compilar el hook en Go: `go build -ldflags="-s -w" -o plugins/obsitracer/bin/obsitracer-hook ./cmd/obsitracer-hook`
  3. Crear symlink limpio en `~/.gemini/antigravity-cli/plugins/obsitracer` y `~/.gemini/config/plugins/obsitracer`.

### Fase 4: Descubrimiento y Multi-Selección de Vaults
- **Propósito:** Configurar los vaults del usuario sin requerir rutas manuales propensas a error.
- **Acciones:**
  1. **Scan automático:** Buscar directorios en `$HOME/Documents` (y subcarpetas hasta nivel 3) que contengan un directorio `.obsidian/`.
  2. **TUI Multi-select:**
     - Renderizar lista interactiva donde el usuario navega con `↑`/`↓`, marca/desmarca con `Tab` o `Space` y confirma con `Enter`.
     - Opción de "Añadir ruta manual" si el vault está fuera de `~/Documents`.
  3. **Ventana Modal de Confirmación:**
     - Muestra el resumen de Vaults seleccionados antes de aplicar:
       ```text
       ┌──────── Confirmación de Vinculación ────────┐
       │ Se vinculará el plugin en:                  │
       │  • Academico  (~/Documents/Academico)       │
       │  • MemorIA    (~/Documents/MemorIA)         │
       │                                             │
       │ ¿Proceder con la instalación? [S/n]         │
       └─────────────────────────────────────────────┘
       ```
  4. **Aplicación:**
     - Generar o actualizar `~/.config/obsitracer/vaults.json`.
     - Crear symlinks en `{Vault}/.obsidian/plugins/obsitracer`.

### Fase 5: Healthcheck y Verificación
- **Propósito:** Garantizar que todo el stack funciona antes de cerrar el instalador.
- **Validaciones automáticas:**
  - Existencia de carpetas de buzón en `~/.config/obsitracer/vaults/{NombreVault}/`.
  - Permisos de ejecución de `obsitracer-hook` y scripts de Tmux.
  - Verificación del target activo con `tmux show-option -p -qv @obsitracer_target`.
- **Panel final:** Resumen con los atajos disponibles (`Alt+o`) y mensaje de éxito.

---

## 🗂️ Estructura Final del Repositorio Obsitracer

```text
Obsitracer/
├── flake.nix                # Entorno reproducible con todas las herramientas TUI
├── Makefile                 # Targets de compilación e instalación atómica
├── install.sh               # Entrypoint del orquestador / TUI Split-Screen
├── plan.md                  # Este documento
├── README.md                # Documentación oficial
├── cmd/
│   └── obsitracer-hook/     # Motor Go del Hook PreInvocation de AGY
├── internal/                # Lógica interna en Go (differ, mailbox, scanner, tmux)
├── obsitracer/              # Código TypeScript del plugin de Obsidian
├── plugins/
│   └── obsitracer/          # Plugin autocontenido para Antigravity
│       ├── hooks.json
│       └── skills/obsitracer-operator/
└── tmux/                    # Plugin de Tmux Autónomo
    ├── obsitracer.tmux      # Entrypoint ejecutable de tmux
    └── scripts/
        ├── obsitracer.sh    # Widget de status bar
        └── obsitracer-select.sh # Selector con fzf
```

---

## 🧪 Criterios de Aceptación (Definition of Done)

- [ ] `bash install.sh` (y `nix run`) levanta la TUI interactiva con el panel dividido.
- [ ] La instalación en Tmux no deja symlinks duros a directorios de desarrollo en dotfiles de MizarOS.
- [ ] La selección de Vaults detecta automáticamente `MemorIA` y `Academico` sin ingresar rutas a mano.
- [ ] `Alt + o` en Tmux levanta el popup flotante y actualiza el target sin fricción.
- [ ] Antigravity recibe el contexto del Vault activo en el primer turno.
