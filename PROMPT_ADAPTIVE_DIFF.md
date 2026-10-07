# 🚀 Prompt de Implementación: Filtro Adaptativo de Diffs en Obsitracer

> **Objetivo:** Implementar la captura y propagación de micro-diffs de contenido textual (líneas agregadas `+` y eliminadas `-`) en caliente desde Obsidian hasta los agentes de IA (Antigravity y Pi Coding Agent), con un **filtro adaptativo por umbral de líneas** que garantice economía estricta de tokens y latencia ultra-baja (< 2ms).

---

## 🧭 Contexto y Justificación de Arquitectura

Actualmente, Obsitracer opera como un radar sensorial de metadatos espaciales: reporta la nota activa, las coordenadas del cursor (`focus.json`) y eventos CRUD a nivel de archivo (`crud.json`: `~ [modified] nota.md`).

Sin embargo, cuando el usuario escribe o edita un párrafo en Obsidian y pregunta al agente *"¿qué opinas de lo que puse?"* o *"ahora?"*, la IA no tiene visibilidad inmediata del texto interno que cambió a menos que ejecute explícitamente su herramienta de lectura (`read` o `view_file`), lo que añade fricción y turnos innecesarios.

Este cambio implementa la especificación original descrita en `c2_buzon.md` (Decisión D2), cerrando la brecha con un **Filtro Adaptativo**:
- **Cambios pequeños ($\le 10$ líneas de diff en la nota activa):** Se inyecta el micro-diff exacto en el payload sensorial. La IA sabe de inmediato qué escribió el usuario sin gastar turnos ni herramientas.
- **Cambios grandes / masivos ($> 10$ líneas o múltiples archivos):** Se degrada limpiamente a lista de archivos (`~ [modified] nota.md`), forzando a la IA a leer mediante su herramienta y protegiendo la ventana de contexto.

---

## 🗺️ Flujo Arquitectónico

```text
               [Obsidian Editor (Manu escribe)]
                               │
                               ▼
            [Plugin TypeScript: obsitracer/main.ts]
            1. Mantiene snapshot en memoria (Map<path, content>)
            2. Al evento modify/cursor, calcula micro-diff (+ / - líneas)
            3. Escribe atómicamente a ~/.config/obsitracer/vaults/<Vault>/crud.json:
               { "op": "modified", "path": "nota.md", "diff": ["+ nueva idea", "- vieja idea"] }
                               │
                               ▼
                 [Motor Go: obsitracer hook]
            1. Drena crud.json y recupera los cambios.
            2. Evalúa Filtro Adaptativo:
               ├─ Si total líneas diff <= MaxDiffLines (10):
               │    Inyecta bloque de micro-diff en [OBSITRACER: DELTA EN VIVO]
               └─ Si total líneas diff > MaxDiffLines:
                    Inyecta resumen estructural: ~ [modified] nota.md
                               │
                               ▼
             [Agente IA: Antigravity CLI / Pi Coding Agent]
             Recibe contexto sináptico inmediato sin saturar tokens.
```

---

## 🛠️ Especificación de Requerimientos Técnicos

### 1. Frontend Obsidian (TypeScript): `obsitracer/main.ts`
- **Snapshot en Memoria:**
  - Mantener un `Map<string, string>` con el contenido previo de los archivos abiertos/modificados.
  - Al abrir o enfocar una nota activa, inicializar su snapshot en memoria (`app.vault.cachedRead`).
- **Cálculo de Micro-Diff:**
  - Al recibir el evento de modificación (`vault.on('modify')` o debounce del buffer):
    - Comparar el nuevo contenido con el snapshot previo.
    - Calcular un diff simple de líneas añadidas (`+`) y eliminadas (`-`), ignorando líneas sin cambios.
    - Limitar la retención de líneas de diff en memoria a un máximo razonable (ej. hasta 30 líneas para no inflar `crud.json`).
  - Actualizar el snapshot en memoria con el nuevo estado del archivo.
- **Estructura en `crud.json`:**
  - Extender el registro pendiente con el campo opcional `diff`:
    ```json
    {
      "op": "modified",
      "path": "Inbox/Prueba de nota.md",
      "diff": [
        "+ Esta es una nueva conclusión clave.",
        "- Conclusión pendiente."
      ],
      "ts": 1791374608
    }
    ```
- **Compilación:**
  - Asegurar compilación limpia mediante `npm run build` o script de empaquetado del plugin.

### 2. Motor Go: Estructuras y Drenaje de Buzón
- **Configuración y Modelos (`internal/config/config.go`):**
  - Añadir constante de umbral:
    ```go
    const MaxDiffLinesPerFile = 10
    const MaxTotalDiffLines = 15
    ```
  - Extender la estructura de eventos de cambio:
    ```go
    type FileChangeEvent struct {
        Op   string   `json:"op"`
        Path string   `json:"path"`
        Diff []string `json:"diff,omitempty"`
    }
    ```
- **Drenaje de Buzón (`internal/mailbox/mailbox.go`):**
  - Asegurar que `DrainCRUDMailbox` deserialice correctamente el array `diff` de cada elemento de `crud.json`.

### 3. Motor Go: Formateador con Filtro Adaptativo (`internal/formatter/formatter.go`)
- **Lógica de Formateo en `FormatLiveDelta`:**
  - Si un archivo modificado incluye líneas de `diff`:
    - Contar el total de líneas de diff.
    - **Si total $\le MaxTotalDiffLines$:**
      Renderizar el bloque de diff expandido bajo el archivo:
      ```text
      [OBSITRACER: DELTA EN VIVO -> Cortex]
      📍 Foco Actual: Inbox/Prueba de nota.md (Línea 4, Columna 24)

      🔄 Cambios en caliente:
      ~ [modificado] Inbox/Prueba de nota.md:
        + Esta es una nueva conclusión clave.
        - Conclusión pendiente.
      ```
    - **Si total $> MaxTotalDiffLines$:**
      Degradar a modo compacto estructural para preservar tokens:
      ```text
      [OBSITRACER: DELTA EN VIVO -> Cortex]
      📍 Foco Actual: Inbox/Prueba de nota.md (Línea 4, Columna 24)

      🔄 Cambios en caliente:
      ~ [modificado] Inbox/Prueba de nota.md (+18 líneas cambiadas)
      ```
- Preservar compatibilidad con creación, eliminación y bloques `/ia(...)`.

### 4. Tests y Validación
- **Tests en Go:**
  - Crear pruebas unitarias en `internal/formatter/formatter_test.go` que validen:
    1. Renderizado de micro-diff cuando las líneas están dentro del umbral ($\le 10$).
    2. Degradación automática a formato compacto cuando excede el umbral ($> 10$).
    3. Mezcla de archivos con diff y archivos sin diff (ej. creados o borrados).
  - Pruebas en `internal/mailbox/mailbox_test.go` para validar drenaje de `crud.json` con campo `diff`.
- **Ejecución de Suite:**
  - Todo debe compilar y pasar con `go test -v ./...`.

---

## 📋 Criterios de Aceptación
1. **Silencio Estricto Intacto:** Si no hay cambios ni foco, `obsitracer hook` sigue emitiendo `{"injectSteps":[]}` y 0 tokens.
2. **Latencia < 2ms:** La evaluación del diff en Go se realiza en memoria sin lecturas de disco adicionales.
3. **Fail-Open:** Si `crud.json` no tiene campo `diff` (versión vieja del plugin o evento legacy), funciona exactamente como hoy sin errores.
4. **Retrocompatibilidad Total:** Funciona idénticamente para Antigravity (`PreInvocation`) y Pi Coding Agent (`before_agent_start`).
