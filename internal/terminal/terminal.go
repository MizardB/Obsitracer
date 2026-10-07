package terminal

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"obsitracer/internal/config"
	"obsitracer/internal/tmux"
)

// IsInsideTmux verifica si la sesión actual corre dentro de un servidor Tmux.
func IsInsideTmux() bool {
	return tmux.IsInsideTmux()
}

// IsInsideKitty verifica si la sesión actual corre dentro del emulador Kitty.
func IsInsideKitty() bool {
	return os.Getenv("KITTY_WINDOW_ID") != "" || os.Getenv("KITTY_LISTEN_ON") != ""
}

// GetTerminalType retorna el identificador del entorno activo.
func GetTerminalType() string {
	if IsInsideTmux() {
		return "tmux"
	}
	if IsInsideKitty() {
		return "kitty"
	}
	return "standalone"
}

func cleanSessionID(sessionID string) string {
	base := filepath.Base(sessionID)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	var b strings.Builder
	for _, r := range base {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteRune('-')
		}
	}
	cleaned := strings.Trim(b.String(), "-")
	if cleaned == "" {
		cleaned = "default"
	}
	return cleaned
}

// CleanSessionID sanitiza un ID de sesión para su uso seguro en nombres de archivos.
func CleanSessionID(sessionID string) string {
	return cleanSessionID(sessionID)
}

// GetSessionTarget obtiene el target configurado para una sesión específica (ej. Pi Coding Agent).
func GetSessionTarget(sessionID string) string {
	if strings.TrimSpace(sessionID) == "" {
		return ""
	}
	sessionFile := filepath.Join(config.GetTargetsDir(), fmt.Sprintf("session-%s", cleanSessionID(sessionID)))
	return readTrimmedFile(sessionFile)
}

// SetSessionTarget persiste el target para una sesión específica.
func SetSessionTarget(sessionID, target string) error {
	if strings.TrimSpace(sessionID) == "" {
		return fmt.Errorf("session ID no puede estar vacío")
	}
	targetsDir := config.GetTargetsDir()
	if err := os.MkdirAll(targetsDir, 0755); err != nil {
		return err
	}
	sessionFile := filepath.Join(targetsDir, fmt.Sprintf("session-%s", cleanSessionID(sessionID)))
	return os.WriteFile(sessionFile, []byte(strings.TrimSpace(target)), 0644)
}

// ClearSessionTarget elimina el target de una sesión específica.
func ClearSessionTarget(sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return nil
	}
	sessionFile := filepath.Join(config.GetTargetsDir(), fmt.Sprintf("session-%s", cleanSessionID(sessionID)))
	if err := os.Remove(sessionFile); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// GetKittyWindowTarget obtiene el target configurado para una ventana específica de Kitty.
func GetKittyWindowTarget(winID string) string {
	if winID == "" {
		return ""
	}
	winTargetFile := filepath.Join(config.GetTargetsDir(), fmt.Sprintf("kitty-%s", winID))
	return readTrimmedKittyTarget(winTargetFile)
}

// GetKittyWindowSession obtiene el ID de sesión registrado para una ventana de Kitty.
func GetKittyWindowSession(winID string) string {
	if winID == "" {
		return ""
	}
	sessionFile := filepath.Join(config.GetTargetsDir(), fmt.Sprintf("kitty-%s.session", winID))
	return readTrimmedKittyTarget(sessionFile)
}

// SetKittyWindowSession asocia un ID de sesión a una ventana de Kitty.
func SetKittyWindowSession(winID, sessionID string) error {
	if winID == "" || strings.TrimSpace(sessionID) == "" {
		return nil
	}
	targetsDir := config.GetTargetsDir()
	if err := os.MkdirAll(targetsDir, 0755); err != nil {
		return err
	}
	sessionFile := filepath.Join(targetsDir, fmt.Sprintf("kitty-%s.session", winID))
	return os.WriteFile(sessionFile, []byte(strings.TrimSpace(sessionID)), 0644)
}

// ClearKittyWindowSession elimina la asociación de sesión de una ventana de Kitty.
func ClearKittyWindowSession(winID string) error {
	if winID == "" {
		return nil
	}
	sessionFile := filepath.Join(config.GetTargetsDir(), fmt.Sprintf("kitty-%s.session", winID))
	if err := os.Remove(sessionFile); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// ResolveTarget resuelve el Vault activo con aislamiento jerárquico:
// 1. Target de sesión específica: si se proporciona sessionID, consultar primero su target.
// 2. Target en Tmux: si estamos en Tmux, consultar exclusivamente variable de panel/ventana.
// 3. Target en Kitty: si estamos en Kitty, consultar exclusivamente buzón de ventana específica.
// 4. Fallback a target global persistido: SÓLO en modo standalone (sin multiplexor).
func ResolveTarget(sessionID, paneOrWinID string) string {
	// 1. Si se proporciona sessionID, consultar primero el target de sesión
	if sessionID != "" {
		if st := GetSessionTarget(sessionID); st != "" {
			return st
		}
	}

	// 2. Si estamos dentro de Tmux, consultar exclusivamente variable de panel/ventana
	if IsInsideTmux() {
		return tmux.GetTmuxTarget(paneOrWinID)
	}

	// 3. Si estamos en Kitty, consultar exclusivamente buzón de ventana específica
	if IsInsideKitty() {
		winID := paneOrWinID
		if winID == "" {
			winID = os.Getenv("KITTY_WINDOW_ID")
		}
		if winID != "" {
			return GetKittyWindowTarget(winID)
		}
		return ""
	}

	// 4. Fallback a target global persistido sólo en modo standalone
	return readTrimmedFile(config.GetCurrentTargetPath())
}

// GetTarget resuelve el Vault activo en el entorno actual (Kitty / Tmux / standalone).
func GetTarget(paneOrWinID string) string {
	return ResolveTarget("", paneOrWinID)
}

// SetTarget establece el Vault activo tanto a nivel global como en el entorno terminal específico.
func SetTarget(paneOrWinID, target string) error {
	targetsDir := config.GetTargetsDir()
	_ = os.MkdirAll(targetsDir, 0755)

	// Sincronizar target global en modo standalone
	if !IsInsideKitty() && !IsInsideTmux() {
		_ = os.WriteFile(config.GetCurrentTargetPath(), []byte(target), 0644)
	}

	// Si estamos en Kitty, registrar buzón local y actualizar user_vars
	if IsInsideKitty() {
		winID := paneOrWinID
		if winID == "" {
			winID = os.Getenv("KITTY_WINDOW_ID")
		}
		if winID != "" {
			winTargetFile := filepath.Join(targetsDir, fmt.Sprintf("kitty-%s", winID))
			_ = os.WriteFile(winTargetFile, []byte(target), 0644)
		}
		syncKittyUserVar(target)
	}

	// Si estamos en Tmux, persistir y refrescar cliente
	if IsInsideTmux() {
		_ = tmux.SetTmuxTarget(paneOrWinID, target)
		tmux.RefreshClient()
	}

	return nil
}

// ClearTarget limpia el Vault activo tanto a nivel global como local.
func ClearTarget(paneOrWinID string) error {
	if !IsInsideKitty() && !IsInsideTmux() {
		_ = os.Remove(config.GetCurrentTargetPath())
	}

	if IsInsideKitty() {
		winID := paneOrWinID
		if winID == "" {
			winID = os.Getenv("KITTY_WINDOW_ID")
		}
		if winID != "" {
			_ = os.Remove(filepath.Join(config.GetTargetsDir(), fmt.Sprintf("kitty-%s", winID)))
		}
		syncKittyUserVar("")
	}

	if IsInsideTmux() {
		_ = tmux.UnsetTmuxTarget(paneOrWinID)
		tmux.RefreshClient()
	}

	return nil
}

// GetTabTarget obtiene el target específico de una pestaña de Kitty.
func GetTabTarget(tabID string) string {
	if tabID == "" {
		return ""
	}
	tabTargetFile := filepath.Join(config.GetTargetsDir(), fmt.Sprintf("kitty-tab-%s", tabID))
	return readTrimmedKittyTarget(tabTargetFile)
}

// SetTabTarget persiste el target a nivel de pestaña de Kitty.
func SetTabTarget(tabID, target string) error {
	if tabID == "" {
		return nil
	}
	targetsDir := config.GetTargetsDir()
	_ = os.MkdirAll(targetsDir, 0755)
	tabTargetFile := filepath.Join(targetsDir, fmt.Sprintf("kitty-tab-%s", tabID))
	return os.WriteFile(tabTargetFile, []byte(target), 0644)
}

// ClearTabTarget elimina el target a nivel de pestaña de Kitty.
func ClearTabTarget(tabID string) error {
	if tabID == "" {
		return nil
	}
	tabTargetFile := filepath.Join(config.GetTargetsDir(), fmt.Sprintf("kitty-tab-%s", tabID))
	return os.Remove(tabTargetFile)
}

// DisplayMessage emite una notificación contextual adecuada al entorno.
func DisplayMessage(paneOrWinID, message string) {
	if IsInsideTmux() {
		tmux.DisplayMessage(paneOrWinID, message)
		return
	}
	fmt.Println(message)
}

func readTrimmedKittyTarget(path string) string {
	fi, err := os.Stat(path)
	if err != nil {
		return ""
	}
	if kittyStart, ok := GetKittyStartTime(); ok && fi.ModTime().Before(kittyStart) {
		_ = os.Remove(path)
		return ""
	}
	return readTrimmedFile(path)
}

func readTrimmedFile(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func syncKittyUserVar(target string) {
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, "kitty", "@", "set-user-vars", fmt.Sprintf("obsitracer_target=%s", target))
	var out bytes.Buffer
	cmd.Stderr = &out
	_ = cmd.Run()
}
