package formatter_test

import (
	"fmt"
	"strings"
	"testing"

	"obsitracer/internal/config"
	"obsitracer/internal/formatter"
)

func TestBuildHookPayload(t *testing.T) {
	empty := formatter.BuildHookPayload("")
	if len(empty.InjectSteps) != 0 {
		t.Errorf("expected 0 inject steps for empty message")
	}

	withMsg := formatter.BuildHookPayload("Hello world")
	if len(withMsg.InjectSteps) != 1 {
		t.Fatalf("expected 1 inject step")
	}
	if withMsg.InjectSteps[0].EphemeralMessage != "Hello world" {
		t.Errorf("unexpected message: %s", withMsg.InjectSteps[0].EphemeralMessage)
	}
}

func TestFormatLiveDelta_WithinThreshold(t *testing.T) {
	focus := &config.FocusInfo{
		File: "Inbox/Prueba de nota.md",
		Line: 4,
		Ch:   24,
	}
	changes := []config.FileChangeEvent{
		{
			Op:   "modified",
			Path: "Inbox/Prueba de nota.md",
			Diff: []string{
				"+ Esta es una nueva conclusión clave.",
				"- Conclusión pendiente.",
			},
		},
	}
	output := formatter.FormatLiveDelta("Cortex", focus, changes, nil)

	expectedSnippet := `[OBSITRACER: DELTA EN VIVO -> Cortex]
📍 Foco Actual: Inbox/Prueba de nota.md (Línea 4, Columna 24)

🔄 Cambios en caliente:
~ [modificado] Inbox/Prueba de nota.md:
  + Esta es una nueva conclusión clave.
  - Conclusión pendiente.`

	if output != expectedSnippet {
		t.Errorf("expected:\n%s\n\ngot:\n%s", expectedSnippet, output)
	}
}

func TestFormatLiveDelta_AbovePerFileThreshold(t *testing.T) {
	focus := &config.FocusInfo{
		File: "Inbox/Prueba de nota.md",
		Line: 4,
		Ch:   24,
	}
	var diffLines []string
	for i := 1; i <= 18; i++ {
		diffLines = append(diffLines, fmt.Sprintf("+ Line %d", i))
	}
	changes := []config.FileChangeEvent{
		{
			Op:   "modified",
			Path: "Inbox/Prueba de nota.md",
			Diff: diffLines,
		},
	}
	output := formatter.FormatLiveDelta("Cortex", focus, changes, nil)

	expectedSnippet := `[OBSITRACER: DELTA EN VIVO -> Cortex]
📍 Foco Actual: Inbox/Prueba de nota.md (Línea 4, Columna 24)

🔄 Cambios en caliente:
~ [modificado] Inbox/Prueba de nota.md (+18 líneas cambiadas)`

	if output != expectedSnippet {
		t.Errorf("expected:\n%s\n\ngot:\n%s", expectedSnippet, output)
	}
	if strings.Contains(output, "+ Line") {
		t.Errorf("degraded output should not contain expanded diff lines")
	}
}

func TestFormatLiveDelta_AboveTotalThreshold(t *testing.T) {
	var diffA, diffB []string
	for i := 1; i <= 8; i++ {
		diffA = append(diffA, fmt.Sprintf("+ A %d", i))
		diffB = append(diffB, fmt.Sprintf("+ B %d", i))
	}
	changes := []config.FileChangeEvent{
		{
			Op:   "modified",
			Path: "FileA.md",
			Diff: diffA,
		},
		{
			Op:   "modified",
			Path: "FileB.md",
			Diff: diffB,
		},
	}
	output := formatter.FormatLiveDelta("Cortex", nil, changes, nil)

	if !strings.Contains(output, "~ [modificado] FileA.md (+8 líneas cambiadas)") {
		t.Errorf("FileA.md should be degraded due to total threshold, got:\n%s", output)
	}
	if !strings.Contains(output, "~ [modificado] FileB.md (+8 líneas cambiadas)") {
		t.Errorf("FileB.md should be degraded due to total threshold, got:\n%s", output)
	}
	if strings.Contains(output, "+ A 1") || strings.Contains(output, "+ B 1") {
		t.Errorf("output should not contain expanded diff lines when total exceeds threshold")
	}
}

func TestFormatLiveDelta_MixedFiles(t *testing.T) {
	changes := []config.FileChangeEvent{
		{
			Op:   "modified",
			Path: "Editada.md",
			Diff: []string{"+ nueva", "- vieja"},
		},
		{
			Op:   "created",
			Path: "Nueva.md",
		},
		{
			Op:   "deleted",
			Path: "Borrada.md",
		},
	}
	output := formatter.FormatLiveDelta("Cortex", nil, changes, nil)

	if !strings.Contains(output, "~ [modificado] Editada.md:\n  + nueva\n  - vieja") {
		t.Errorf("expected expanded diff for Editada.md, got:\n%s", output)
	}
	if !strings.Contains(output, "~ [creado] Nueva.md") {
		t.Errorf("expected created entry for Nueva.md, got:\n%s", output)
	}
	if !strings.Contains(output, "~ [eliminado] Borrada.md") {
		t.Errorf("expected deleted entry for Borrada.md, got:\n%s", output)
	}
}

func TestFormatLiveDelta_LegacyNilDiff(t *testing.T) {
	changes := []config.FileChangeEvent{
		{
			Op:   "modified",
			Path: "Legacy.md",
			Diff: nil,
		},
	}
	output := formatter.FormatLiveDelta("Cortex", nil, changes, nil)

	if !strings.Contains(output, "~ [modificado] Legacy.md") {
		t.Errorf("expected '~ [modificado] Legacy.md', got:\n%s", output)
	}
	if strings.Contains(output, "líneas cambiadas") || strings.Contains(output, "Legacy.md:") {
		t.Errorf("legacy event without diff should not contain diff indicators, got:\n%s", output)
	}
}

func TestFormatLiveDelta_Deduplication(t *testing.T) {
	changes := []config.FileChangeEvent{
		{
			Op:   "modified",
			Path: "Dupe.md",
			Diff: []string{"+ step 1"},
		},
		{
			Op:   "modified",
			Path: "Dupe.md",
			Diff: []string{"+ step 2", "- old"},
		},
	}
	output := formatter.FormatLiveDelta("Cortex", nil, changes, nil)

	if strings.Count(output, "Dupe.md") != 1 {
		t.Errorf("expected Dupe.md to appear exactly once, got:\n%s", output)
	}
	if !strings.Contains(output, "+ step 2") || !strings.Contains(output, "- old") {
		t.Errorf("expected latest diff content, got:\n%s", output)
	}
}

func TestFormatLiveDelta_WithFocusAndIABlocks(t *testing.T) {
	focus := &config.FocusInfo{
		File: "Test.md",
		Line: 10,
		Ch:   5,
	}
	iaBlocks := []map[string]any{
		{
			"file":   "Test.md",
			"line":   12,
			"prompt": "Explica esta sección",
		},
	}
	changes := []config.FileChangeEvent{
		{
			Op:   "modified",
			Path: "Test.md",
			Diff: []string{"+ cambio"},
		},
	}
	output := formatter.FormatLiveDelta("Cortex", focus, changes, iaBlocks)

	if !strings.Contains(output, "📍 Foco Actual: Test.md (Línea 10, Columna 5)") {
		t.Errorf("expected focus info, got:\n%s", output)
	}
	if !strings.Contains(output, "⚡ Bloques /ia() Pendientes:") || !strings.Contains(output, "Explica esta sección") {
		t.Errorf("expected IA block info, got:\n%s", output)
	}
}

func TestFormatSessionStart(t *testing.T) {
	focus := config.FocusInfo{
		File: "02_Contexts/Obsitracer/Obsitracer.md",
		Line: 42,
		Ch:   10,
	}
	iaBlocks := []map[string]any{
		{
			"file":   "02_Contexts/Obsitracer/Obsitracer.md",
			"line":   15,
			"prompt": "Genera el diagrama",
		},
	}
	output := formatter.FormatSessionStart("Cortex", focus, iaBlocks)

	if !strings.Contains(output, "[OBSITRACER: INICIO DE SESIÓN -> Cortex]") {
		t.Errorf("expected session start header, got:\n%s", output)
	}
	if !strings.Contains(output, "📍 Foco Inicial: 02_Contexts/Obsitracer/Obsitracer.md (Línea 42, Columna 10)") {
		t.Errorf("expected initial focus line, got:\n%s", output)
	}
	if !strings.Contains(output, "⚡ Bloques /ia() Pendientes:") || !strings.Contains(output, "Genera el diagrama") {
		t.Errorf("expected pending IA blocks, got:\n%s", output)
	}
	if strings.Contains(output, "Diferencial Estructural") || strings.Contains(output, "Sin cambios estructurales") {
		t.Errorf("session start should never include historical diffs or backlog, got:\n%s", output)
	}
}

func TestFormatLiveDelta_CappedBurst(t *testing.T) {
	var changes []config.FileChangeEvent
	for i := 1; i <= 12; i++ {
		changes = append(changes, config.FileChangeEvent{
			Op:   "modified",
			Path: fmt.Sprintf("Note_%02d.md", i),
		})
	}

	output := formatter.FormatLiveDelta("Cortex", nil, changes, nil)

	// Verify only first 8 items are displayed
	for i := 1; i <= config.MaxItemsDisplay; i++ {
		expectedFile := fmt.Sprintf("Note_%02d.md", i)
		if !strings.Contains(output, expectedFile) {
			t.Errorf("expected file %s to be listed in capped output, got:\n%s", expectedFile, output)
		}
	}

	// Verify items beyond 8 are not listed individually
	for i := config.MaxItemsDisplay + 1; i <= 12; i++ {
		unexpectedFile := fmt.Sprintf("Note_%02d.md", i)
		if strings.Contains(output, unexpectedFile) {
			t.Errorf("did not expect file %s to be listed individually, got:\n%s", unexpectedFile, output)
		}
	}

	// Verify summary line
	expectedSummary := "... y 4 cambios adicionales en lote"
	if !strings.Contains(output, expectedSummary) {
		t.Errorf("expected summary line '%s', got:\n%s", expectedSummary, output)
	}
}

func TestFormatLiveDelta_WithEnrichedIABlocks_Selection(t *testing.T) {
	focus := &config.FocusInfo{
		File: "Test.md",
		Line: 10,
		Ch:   5,
	}
	iaBlocks := []map[string]any{
		{
			"file":      "Test.md",
			"line":      12,
			"ch":        3,
			"prompt":    "Resume este párrafo clave",
			"selection": "Texto seleccionado importante para resumir",
			"ts":        "2026-10-07T12:00:00Z",
		},
	}
	output := formatter.FormatLiveDelta("Cortex", focus, nil, iaBlocks)

	if !strings.Contains(output, `⚡ Bloques /ia() Pendientes:`) {
		t.Errorf("expected header in output:\n%s", output)
	}
	if !strings.Contains(output, `- Test.md:12 -> "Resume este párrafo clave"`) {
		t.Errorf("expected prompt line in output:\n%s", output)
	}
	if !strings.Contains(output, `📍 Selección: "Texto seleccionado importante para resumir"`) {
		t.Errorf("expected selection line in output:\n%s", output)
	}
}

func TestFormatLiveDelta_WithEnrichedIABlocks_MultilinePrompt(t *testing.T) {
	focus := &config.FocusInfo{
		File: "Docs/Arch.md",
		Line: 20,
		Ch:   0,
	}
	iaBlocks := []map[string]any{
		{
			"file":      "Docs/Arch.md",
			"line":      25,
			"prompt":    "Analiza los siguientes puntos:\n1. Rendimiento y latencia\n2. Seguridad de memoria",
			"selection": "type SystemArchitecture struct {\n    Name string\n}",
		},
	}
	output := formatter.FormatLiveDelta("Cortex", focus, nil, iaBlocks)

	if !strings.Contains(output, `- Docs/Arch.md:25:`) {
		t.Errorf("expected block header in output:\n%s", output)
	}
	if !strings.Contains(output, `📍 Selección: "type SystemArchitecture struct {`) {
		t.Errorf("expected multiline selection start in output:\n%s", output)
	}
	if !strings.Contains(output, `Prompt:`) {
		t.Errorf("expected Prompt label in output:\n%s", output)
	}
	if !strings.Contains(output, `1. Rendimiento y latencia`) || !strings.Contains(output, `2. Seguridad de memoria`) {
		t.Errorf("expected multiline prompt lines in output:\n%s", output)
	}
}

func TestFormatSessionStart_WithEnrichedIABlocks(t *testing.T) {
	focus := config.FocusInfo{
		File: "Notas/Ideas.md",
		Line: 5,
		Ch:   2,
	}
	iaBlocks := []map[string]any{
		{
			"file":      "Notas/Ideas.md",
			"line":      5,
			"prompt":    "Desarrolla la idea del modal IA",
			"selection": "Modal de Peticiones IA",
		},
	}
	output := formatter.FormatSessionStart("Cortex", focus, iaBlocks)

	if !strings.Contains(output, `[OBSITRACER: INICIO DE SESIÓN -> Cortex]`) {
		t.Errorf("expected session start header in output:\n%s", output)
	}
	if !strings.Contains(output, `- Notas/Ideas.md:5 -> "Desarrolla la idea del modal IA"`) {
		t.Errorf("expected prompt line in output:\n%s", output)
	}
	if !strings.Contains(output, `📍 Selección: "Modal de Peticiones IA"`) {
		t.Errorf("expected selection in output:\n%s", output)
	}
}


