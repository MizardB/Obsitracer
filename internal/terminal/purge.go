package terminal

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"obsitracer/internal/config"
)

type kittyOSWindow struct {
	ID   int        `json:"id"`
	Tabs []kittyTab `json:"tabs"`
}

type kittyTab struct {
	ID      int           `json:"id"`
	Windows []kittyWindow `json:"windows"`
}

type kittyWindow struct {
	ID int `json:"id"`
}

var kittyStartTimeProvider = getKittyStartTimeReal

func getKittyStartTimeReal() (time.Time, bool) {
	pid := os.Getenv("KITTY_PID")
	if pid == "" {
		listen := os.Getenv("KITTY_LISTEN_ON")
		if idx := strings.LastIndex(listen, "-"); idx != -1 {
			pid = listen[idx+1:]
		}
	}
	if pid == "" {
		return time.Time{}, false
	}
	fi, err := os.Stat(filepath.Join("/proc", pid))
	if err != nil {
		return time.Time{}, false
	}
	return fi.ModTime(), true
}

// GetKittyStartTime retorna la fecha de inicio del proceso de Kitty actual.
func GetKittyStartTime() (time.Time, bool) {
	return kittyStartTimeProvider()
}

// PurgeStaleTargets elimina archivos de target de ventanas/pestañas de Kitty
// que ya no existen en la sesión activa o que provienen de instancias anteriores de Kitty.
// Retorna el número de archivos purgados.
func PurgeStaleTargets() int {
	if !IsInsideKitty() {
		return 0
	}

	kittyStartTime, hasKittyStart := GetKittyStartTime()
	windowIDs, tabIDs := getKittyActiveIDs()
	if windowIDs == nil && tabIDs == nil && !hasKittyStart {
		return 0
	}

	targetsDir := config.GetTargetsDir()
	entries, err := os.ReadDir(targetsDir)
	if err != nil {
		return 0
	}

	purged := 0
	for _, e := range entries {
		name := e.Name()
		if !strings.HasPrefix(name, "kitty-") {
			continue
		}

		filePath := filepath.Join(targetsDir, name)
		fi, err := e.Info()
		if err == nil && hasKittyStart && fi.ModTime().Before(kittyStartTime) {
			_ = os.Remove(filePath)
			purged++
			continue
		}

		if windowIDs != nil || tabIDs != nil {
			var alive bool
			if strings.HasPrefix(name, "kitty-tab-") {
				id := strings.TrimPrefix(name, "kitty-tab-")
				if tabIDs != nil {
					_, alive = tabIDs[id]
				}
			} else if strings.HasSuffix(name, ".session") {
				id := strings.TrimSuffix(strings.TrimPrefix(name, "kitty-"), ".session")
				if windowIDs != nil {
					_, alive = windowIDs[id]
				}
			} else {
				id := strings.TrimPrefix(name, "kitty-")
				if windowIDs != nil {
					_, alive = windowIDs[id]
				}
			}

			if !alive {
				_ = os.Remove(filePath)
				purged++
			}
		}
	}
	return purged
}

var kittyActiveIDsProvider = getKittyActiveIDsReal

func getKittyActiveIDs() (windowIDs map[string]struct{}, tabIDs map[string]struct{}) {
	return kittyActiveIDsProvider()
}

// getKittyActiveIDsReal consulta `kitty @ ls` y retorna los IDs de ventanas y pestañas activas.
// Retorna (nil, nil) si la consulta falla.
func getKittyActiveIDsReal() (windowIDs map[string]struct{}, tabIDs map[string]struct{}) {
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, "kitty", "@", "ls")
	out, err := cmd.Output()
	if err != nil || len(out) == 0 {
		return nil, nil
	}

	var osWindows []kittyOSWindow
	if err := json.Unmarshal(out, &osWindows); err != nil {
		return nil, nil
	}

	windowIDs = make(map[string]struct{})
	tabIDs = make(map[string]struct{})

	for _, osWin := range osWindows {
		for _, tab := range osWin.Tabs {
			tabIDs[fmt.Sprintf("%d", tab.ID)] = struct{}{}
			for _, win := range tab.Windows {
				windowIDs[fmt.Sprintf("%d", win.ID)] = struct{}{}
			}
		}
	}
	return windowIDs, tabIDs
}
