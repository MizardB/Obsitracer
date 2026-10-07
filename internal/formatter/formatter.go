package formatter

import (
	"fmt"
	"strings"

	"obsitracer/internal/config"
)

func FormatSessionStart(
	targetVault string,
	focus config.FocusInfo,
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

	if len(iaBlocks) > 0 {
		lines = append(lines, formatIABlocks(iaBlocks)...)
	}

	return strings.Join(lines, "\n")
}

func normalizeOp(op string) string {
	switch strings.ToLower(op) {
	case "created", "creado":
		return "creado"
	case "modified", "modificado", "":
		return "modificado"
	case "deleted", "eliminado":
		return "eliminado"
	default:
		return op
	}
}

func FormatLiveDelta(
	targetVault string,
	focus *config.FocusInfo,
	changes []config.FileChangeEvent,
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

		// Deduplicar cambios por path preservando el orden y el estado más reciente
		var deduped []config.FileChangeEvent
		seen := make(map[string]int)
		for _, ch := range changes {
			if ch.Path == "" {
				continue
			}
			if idx, exists := seen[ch.Path]; exists {
				deduped[idx] = ch
			} else {
				seen[ch.Path] = len(deduped)
				deduped = append(deduped, ch)
			}
		}

		totalDiffLines := 0
		for _, ch := range deduped {
			totalDiffLines += len(ch.Diff)
		}

		itemsToDisplay := deduped
		excess := 0
		if len(deduped) > config.MaxItemsDisplay {
			itemsToDisplay = deduped[:config.MaxItemsDisplay]
			excess = len(deduped) - config.MaxItemsDisplay
		}

		for _, ch := range itemsToDisplay {
			op := normalizeOp(ch.Op)
			diffCount := len(ch.Diff)

			if diffCount == 0 {
				lines = append(lines, fmt.Sprintf("~ [%s] %s", op, ch.Path))
			} else if totalDiffLines > config.MaxTotalDiffLines || diffCount > config.MaxDiffLinesPerFile {
				lines = append(lines, fmt.Sprintf("~ [%s] %s (+%d líneas cambiadas)", op, ch.Path, diffCount))
			} else {
				lines = append(lines, fmt.Sprintf("~ [%s] %s:", op, ch.Path))
				for _, d := range ch.Diff {
					prefix := ""
					if !strings.HasPrefix(d, "+") && !strings.HasPrefix(d, "-") {
						prefix = "+ "
					}
					lines = append(lines, fmt.Sprintf("  %s%s", prefix, d))
				}
			}
		}

		if excess > 0 {
			lines = append(lines, fmt.Sprintf("... y %d cambios adicionales en lote", excess))
		}
	}

	if len(iaBlocks) > 0 {
		lines = append(lines, formatIABlocks(iaBlocks)...)
	}

	return strings.Join(lines, "\n")
}

func formatIABlocks(iaBlocks []map[string]any) []string {
	if len(iaBlocks) == 0 {
		return nil
	}
	var lines []string
	lines = append(lines, "\n⚡ Bloques /ia() Pendientes:")
	for _, b := range iaBlocks {
		fileVal := b["file"]
		if fileVal == nil || fileVal == "" {
			fileVal = "(sin archivo)"
		}

		lineVal := b["line"]
		if lineVal == nil || lineVal == 0 || lineVal == float64(0) {
			lineVal = 1
		}

		promptRaw := fmt.Sprintf("%v", b["prompt"])
		prompt := strings.TrimSpace(promptRaw)

		var selection string
		if sel, ok := b["selection"].(string); ok && strings.TrimSpace(sel) != "" {
			selection = strings.TrimSpace(sel)
		}

		isMultilinePrompt := strings.Contains(prompt, "\n")
		hasSelection := selection != ""

		if isMultilinePrompt {
			lines = append(lines, fmt.Sprintf("- %v:%v:", fileVal, lineVal))
			if hasSelection {
				if strings.Contains(selection, "\n") {
					sLines := strings.Split(selection, "\n")
					lines = append(lines, fmt.Sprintf("  📍 Selección: \"%s", sLines[0]))
					for _, sLine := range sLines[1:] {
						lines = append(lines, fmt.Sprintf("    %s", sLine))
					}
					lines[len(lines)-1] += "\""
				} else {
					lines = append(lines, fmt.Sprintf("  📍 Selección: \"%s\"", selection))
				}
			}
			lines = append(lines, "  Prompt:")
			for _, pLine := range strings.Split(prompt, "\n") {
				lines = append(lines, fmt.Sprintf("    %s", pLine))
			}
		} else {
			lines = append(lines, fmt.Sprintf("- %v:%v -> \"%v\"", fileVal, lineVal, prompt))
			if hasSelection {
				if strings.Contains(selection, "\n") {
					sLines := strings.Split(selection, "\n")
					lines = append(lines, fmt.Sprintf("  📍 Selección: \"%s", sLines[0]))
					for _, sLine := range sLines[1:] {
						lines = append(lines, fmt.Sprintf("    %s", sLine))
					}
					lines[len(lines)-1] += "\""
				} else {
					lines = append(lines, fmt.Sprintf("  📍 Selección: \"%s\"", selection))
				}
			}
		}
	}
	return lines
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
