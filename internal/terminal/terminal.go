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

// GetTarget resuelve el Vault activo con aislamiento estricto por terminal:
// 1. Target en Tmux: sólo retorna si el panel/ventana está sintonizado. Silencio ("") por defecto.
// 2. Target en Kitty: sólo retorna si la ventana específica está sintonizada. Silencio ("") por defecto.
// 3. Fallback a target global persistido: SÓLO en modo standalone (sin multiplexor).
func GetTarget(paneOrWinID string) string {
	// 1. Si estamos dentro de Tmux, consultar exclusivamente variable de panel/ventana
	if IsInsideTmux() {
		return tmux.GetTmuxTarget(paneOrWinID)
	}

	// 2. Si estamos en Kitty, consultar exclusivamente buzón de ventana específica
	if IsInsideKitty() {
		winID := paneOrWinID
		if winID == "" {
			winID = os.Getenv("KITTY_WINDOW_ID")
		}
		if winID != "" {
			winTargetFile := filepath.Join(config.GetTargetsDir(), fmt.Sprintf("kitty-%s", winID))
			return readTrimmedKittyTarget(winTargetFile)
		}
		return ""
	}

	// 3. Fallback a target global persistido sólo en modo standalone
	return readTrimmedFile(config.GetCurrentTargetPath())
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
