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

// PurgeStaleTargets elimina archivos de target de ventanas/pestañas de Kitty
// que ya no existen en la sesión activa. Retorna el número de archivos purgados.
// Si no puede consultar Kitty (timeout, sin socket), retorna 0 sin purgar nada
// para evitar falsos positivos.
func PurgeStaleTargets() int {
	if !IsInsideKitty() {
		return 0
	}

	windowIDs, tabIDs := getKittyActiveIDs()
	if windowIDs == nil && tabIDs == nil {
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

		var alive bool
		if strings.HasPrefix(name, "kitty-tab-") {
			id := strings.TrimPrefix(name, "kitty-tab-")
			_, alive = tabIDs[id]
		} else {
			id := strings.TrimPrefix(name, "kitty-")
			_, alive = windowIDs[id]
		}

		if !alive {
			_ = os.Remove(filepath.Join(targetsDir, name))
			purged++
		}
	}
	return purged
}

// getKittyActiveIDs consulta `kitty @ ls` y retorna los IDs de ventanas y pestañas activas.
// Retorna (nil, nil) si la consulta falla.
func getKittyActiveIDs() (windowIDs map[string]struct{}, tabIDs map[string]struct{}) {
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
