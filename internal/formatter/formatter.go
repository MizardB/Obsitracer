package formatter

import (
	"fmt"
	"strings"

	"obsitracer/internal/config"
)

func FormatSessionStart(
	targetVault string,
	focus config.FocusInfo,
	diff config.StructuralDiff,
	iaBlocks []map[string]any,
) string {
	var lines []string
	lines = append(lines, fmt.Sprintf("[OBSITRACER: INICIO DE SESIÓN -> %s]", targetVault))

	if focus.IsValid() {
		line := focus.Line
		if line <= 0 {
			line = 1
		}
		lines = append(lines, fmt.Sprintf("\n📍 Foco Inicial: %s (Línea %d, Columna %d)", focus.File, line, focus.Ch))
	}

	if diff.HasChanges() {
		lines = append(lines, "\n🔄 Diferencial Estructural desde última sesión:")
		limit := config.MaxItemsDisplay
		for i, p := range diff.Created {
			if i >= limit {
				break
			}
			lines = append(lines, fmt.Sprintf("+ [Creado] %s", p))
		}
		for i, p := range diff.Modified {
			if i >= limit {
				break
			}
			lines = append(lines, fmt.Sprintf("~ [Modificado] %s", p))
		}
		for i, p := range diff.Trashed {
			if i >= limit {
				break
			}
			lines = append(lines, fmt.Sprintf("🗑️ [Papelera] %s", p))
		}
		for i, p := range diff.Deleted {
			if i >= limit {
				break
			}
			lines = append(lines, fmt.Sprintf("- [Eliminado] %s", p))
		}
		for i, p := range diff.Purged {
			if i >= limit {
				break
			}
			lines = append(lines, fmt.Sprintf("❌ [Purgado] %s", p))
		}

		shown := min(limit, len(diff.Created)) +
			min(limit, len(diff.Modified)) +
			min(limit, len(diff.Trashed)) +
			min(limit, len(diff.Deleted)) +
			min(limit, len(diff.Purged))

		remaining := diff.TotalCount() - shown
		if remaining > 0 {
			lines = append(lines, fmt.Sprintf("... y %d cambios adicionales.", remaining))
		}
	} else {
		lines = append(lines, "\nSin cambios estructurales en el Vault desde la última sesión.")
	}

	if len(iaBlocks) > 0 {
		lines = append(lines, "\n⚡ Bloques /ia() Pendientes:")
		for _, b := range iaBlocks {
			file := b["file"]
			line := b["line"]
			prompt := b["prompt"]
			lines = append(lines, fmt.Sprintf("- %v:%v -> \"%v\"", file, line, prompt))
		}
	}

	return strings.Join(lines, "\n")
}

func FormatLiveDelta(
	targetVault string,
	focus *config.FocusInfo,
	changes []map[string]any,
	iaBlocks []map[string]any,
) string {
	var lines []string
	lines = append(lines, fmt.Sprintf("[OBSITRACER: DELTA EN VIVO -> %s]", targetVault))

	if focus != nil && focus.IsValid() {
		line := focus.Line
		if line <= 0 {
			line = 1
		}
		lines = append(lines, fmt.Sprintf("📍 Foco Actual: %s (Línea %d, Columna %d)", focus.File, line, focus.Ch))
	}

	if len(changes) > 0 {
		lines = append(lines, "\n🔄 Cambios en caliente:")
		seen := make(map[string]bool)
		for _, ch := range changes {
			path, _ := ch["path"].(string)
			op, _ := ch["op"].(string)
			if op == "" {
				op = "modificado"
			}
			if path != "" && !seen[path] {
				seen[path] = true
				lines = append(lines, fmt.Sprintf("~ [%s] %s", op, path))
			}
		}
	}

	if len(iaBlocks) > 0 {
		lines = append(lines, "\n⚡ Bloques /ia() Pendientes:")
		for _, b := range iaBlocks {
			file := b["file"]
			line := b["line"]
			prompt := b["prompt"]
			lines = append(lines, fmt.Sprintf("- %v:%v -> \"%v\"", file, line, prompt))
		}
	}

	return strings.Join(lines, "\n")
}

func BuildHookPayload(message string) config.HookPayload {
	if message == "" {
		return config.HookPayload{
			InjectSteps: []config.InjectStep{},
		}
	}
	return config.HookPayload{
		InjectSteps: []config.InjectStep{
			{EphemeralMessage: message},
		},
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
