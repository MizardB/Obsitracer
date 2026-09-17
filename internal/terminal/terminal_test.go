package terminal

import (
	"os"
	"path/filepath"
	"testing"

	"obsitracer/internal/config"
)

func TestTerminalTargetResolution(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-term-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	// Inicialmente sin target
	if target := GetTarget(""); target != "" {
		t.Fatalf("Expected empty target, got: %s", target)
	}

	// Establecer target
	expected := "MemorIA"
	if err := SetTarget("", expected); err != nil {
		t.Fatalf("SetTarget failed: %v", err)
	}

	// Verificar lectura
	got := GetTarget("")
	if got != expected {
		t.Fatalf("Expected %s, got %s", expected, got)
	}

	// Limpiar target
	if err := ClearTarget(""); err != nil {
		t.Fatalf("ClearTarget failed: %v", err)
	}

	if target := GetTarget(""); target != "" {
		t.Fatalf("Expected empty target after clear, got: %s", target)
	}
}

func TestKittyWindowTargetResolution(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-term-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	origKittyID := os.Getenv("KITTY_WINDOW_ID")
	defer os.Setenv("KITTY_WINDOW_ID", origKittyID)

	os.Setenv("KITTY_WINDOW_ID", "42")
	_ = os.MkdirAll(config.GetTargetsDir(), 0755)

	// Escribir target específico para la ventana 42
	winFile := filepath.Join(config.GetTargetsDir(), "kitty-42")
	_ = os.WriteFile(winFile, []byte("Academico"), 0644)

	got := GetTarget("")
	if got != "Academico" {
		t.Fatalf("Expected Academico from kitty window, got: %s", got)
	}
}

func TestKittyWindowNoTargetDefaultSilence(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-term-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	origKittyID := os.Getenv("KITTY_WINDOW_ID")
	defer os.Setenv("KITTY_WINDOW_ID", origKittyID)

	// Simular target global persistido en disco (de otra sesión/terminal)
	_ = os.MkdirAll(config.GetBaseConfigDir(), 0755)
	_ = os.WriteFile(config.GetCurrentTargetPath(), []byte("Cortex"), 0644)

	// Simular ventana nueva de Kitty donde NO se ha seleccionado target
	os.Setenv("KITTY_WINDOW_ID", "99")

	got := GetTarget("")
	if got != "" {
		t.Fatalf("Expected silence ('') in new kitty window, got: %s", got)
	}
}

