package terminal

import (
	"bytes"
	"context"
	"encoding/json"
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

// GetTarget resuelve el Vault activo con fallback jerárquico ultra-rápido:
// 1. Target en Tmux (si está activo)
// 2. Target específico de ventana Kitty (~/.config/obsitracer/targets/kitty-<id>)
// 3. Target global persistido (~/.config/obsitracer/current_target)
// 4. Inferencia por coincidencia de ruta actual (CWD vs vaults.json)
func GetTarget(paneOrWinID string) string {
	// 1. Si estamos dentro de Tmux, consultar variable de panel/ventana
	if IsInsideTmux() {
		if t := tmux.GetTmuxTarget(paneOrWinID); t != "" {
			return t
		}
	}

	// 2. Si estamos en Kitty, consultar buzón de ventana específica
	if IsInsideKitty() {
		winID := paneOrWinID
		if winID == "" {
			winID = os.Getenv("KITTY_WINDOW_ID")
		}
		if winID != "" {
			winTargetFile := filepath.Join(config.GetTargetsDir(), fmt.Sprintf("kitty-%s", winID))
			if t := readTrimmedFile(winTargetFile); t != "" {
				return t
			}
		}
	}

	// 3. Fallback a target global de sesión
	if t := readTrimmedFile(config.GetCurrentTargetPath()); t != "" {
		return t
	}

	// 4. Inferencia por coincidencia de ruta actual (CWD)
	var currentPath string
	if IsInsideTmux() {
		currentPath = tmux.GetPanePath(paneOrWinID)
	}
	if currentPath == "" {
		currentPath, _ = os.Getwd()
	}

	if currentPath != "" {
		registryPath := config.GetVaultsRegistryPath()
		if raw, err := os.ReadFile(registryPath); err == nil && len(raw) > 0 {
			var vaults []config.VaultEntry
			if json.Unmarshal(raw, &vaults) == nil {
				for _, v := range vaults {
					if strings.HasPrefix(currentPath, v.Path) {
						return v.Name
					}
				}
			}
		}
	}

	return ""
}

// SetTarget establece el Vault activo tanto a nivel global como en el entorno terminal específico.
func SetTarget(paneOrWinID, target string) error {
	targetsDir := config.GetTargetsDir()
	_ = os.MkdirAll(targetsDir, 0755)

	// Siempre sincronizar target global
	_ = os.WriteFile(config.GetCurrentTargetPath(), []byte(target), 0644)

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
	_ = os.Remove(config.GetCurrentTargetPath())

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
	return readTrimmedFile(tabTargetFile)
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
