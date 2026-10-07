package terminal

import (
	"os"
	"path/filepath"
	"testing"
	"time"

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

func TestKittyWindowStaleTargetFromOlderSession(t *testing.T) {
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

	os.Setenv("KITTY_WINDOW_ID", "1")
	_ = os.MkdirAll(config.GetTargetsDir(), 0755)

	// Simular archivo de target creado hace 2 horas
	winFile := filepath.Join(config.GetTargetsDir(), "kitty-1")
	_ = os.WriteFile(winFile, []byte("MemorIA"), 0644)
	oldTime := time.Now().Add(-2 * time.Hour)
	_ = os.Chtimes(winFile, oldTime, oldTime)

	// Simular que Kitty inició hace 10 minutos (después de que el archivo fue creado)
	origProvider := kittyStartTimeProvider
	defer func() { kittyStartTimeProvider = origProvider }()
	kittyStartTimeProvider = func() (time.Time, bool) {
		return time.Now().Add(-10 * time.Minute), true
	}

	// GetTarget debe detectar que el archivo es de una sesión anterior, ignorarlo y eliminarlo
	got := GetTarget("")
	if got != "" {
		t.Fatalf("Expected empty target for stale session file, got: %s", got)
	}

	if _, err := os.Stat(winFile); !os.IsNotExist(err) {
		t.Fatalf("Expected stale target file to be purged on read")
	}
}

func TestPurgeStaleTargetsFromOlderSession(t *testing.T) {
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
	os.Setenv("KITTY_WINDOW_ID", "5")

	_ = os.MkdirAll(config.GetTargetsDir(), 0755)

	// Archivo viejo (de hace 2 horas)
	oldFile := filepath.Join(config.GetTargetsDir(), "kitty-1")
	_ = os.WriteFile(oldFile, []byte("MemorIA"), 0644)
	oldTime := time.Now().Add(-2 * time.Hour)
	_ = os.Chtimes(oldFile, oldTime, oldTime)

	// Archivo nuevo (de hace 2 minutos)
	newFile := filepath.Join(config.GetTargetsDir(), "kitty-5")
	_ = os.WriteFile(newFile, []byte("Academico"), 0644)
	newTime := time.Now().Add(-2 * time.Minute)
	_ = os.Chtimes(newFile, newTime, newTime)

	// Kitty inició hace 10 minutos
	origProvider := kittyStartTimeProvider
	defer func() { kittyStartTimeProvider = origProvider }()
	kittyStartTimeProvider = func() (time.Time, bool) {
		return time.Now().Add(-10 * time.Minute), true
	}

	purged := PurgeStaleTargets()
	if purged < 1 {
		t.Fatalf("Expected at least 1 purged target, got: %d", purged)
	}

	// El archivo viejo debe haber desaparecido
	if _, err := os.Stat(oldFile); !os.IsNotExist(err) {
		t.Fatalf("Expected oldFile to be purged")
	}
}

func TestSessionTargetCRUD(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-session-crud-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	sessionID := "/home/manu/.pi/agent/sessions/test-session-123.jsonl"

	// 1. Inicialmente sin target
	if got := GetSessionTarget(sessionID); got != "" {
		t.Fatalf("Expected empty target, got: %s", got)
	}

	// 2. Establecer target de sesión
	if err := SetSessionTarget(sessionID, "Cortex"); err != nil {
		t.Fatalf("SetSessionTarget failed: %v", err)
	}

	// 3. Verificar que se lee correctamente
	if got := GetSessionTarget(sessionID); got != "Cortex" {
		t.Fatalf("Expected Cortex, got: %s", got)
	}

	// 4. Limpiar target de sesión
	if err := ClearSessionTarget(sessionID); err != nil {
		t.Fatalf("ClearSessionTarget failed: %v", err)
	}

	if got := GetSessionTarget(sessionID); got != "" {
		t.Fatalf("Expected empty target after clear, got: %s", got)
	}
}

func TestSessionTargetPrecedence(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-session-prec-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	origKittyID := os.Getenv("KITTY_WINDOW_ID")
	defer os.Setenv("KITTY_WINDOW_ID", origKittyID)

	// Simular entorno Kitty con ventana 10 sintonizada a "KittyVault"
	os.Setenv("KITTY_WINDOW_ID", "10")
	_ = os.MkdirAll(config.GetTargetsDir(), 0755)
	winFile := filepath.Join(config.GetTargetsDir(), "kitty-10")
	_ = os.WriteFile(winFile, []byte("KittyVault"), 0644)

	// Caso A: Sin session target configurado -> cae al target de Kitty
	sessionA := "session-without-target"
	if got := ResolveTarget(sessionA, ""); got != "KittyVault" {
		t.Fatalf("Expected fallback to KittyVault, got: %s", got)
	}

	// Caso B: Con session target configurado -> tiene precedencia sobre Kitty
	sessionB := "session-with-target"
	if err := SetSessionTarget(sessionB, "PiSessionVault"); err != nil {
		t.Fatalf("SetSessionTarget failed: %v", err)
	}

	if got := ResolveTarget(sessionB, ""); got != "PiSessionVault" {
		t.Fatalf("Expected PiSessionVault precedence over Kitty, got: %s", got)
	}

	// Caso C: Al limpiar el session target -> vuelve a caer al target de Kitty
	if err := ClearSessionTarget(sessionB); err != nil {
		t.Fatalf("ClearSessionTarget failed: %v", err)
	}

	if got := ResolveTarget(sessionB, ""); got != "KittyVault" {
		t.Fatalf("Expected fallback to KittyVault after clear, got: %s", got)
	}
}

