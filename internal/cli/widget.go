package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"obsitracer/internal/config"
	"obsitracer/internal/mailbox"
	"obsitracer/internal/tmux"

	"github.com/spf13/cobra"
)

var widgetPaneID string

var widgetCmd = &cobra.Command{
	Use:   "widget",
	Short: "Genera el badge de estado para la barra de Tmux",
	Run: func(cmd *cobra.Command, args []string) {
		cmdName := tmux.GetPaneCommand(widgetPaneID)
		if !strings.Contains(cmdName, "agy") {
			return
		}

		targetVault := tmux.GetTmuxTarget(widgetPaneID)

		if targetVault == "" {
			panePath := tmux.GetPanePath(widgetPaneID)
			registryPath := config.GetVaultsRegistryPath()
			raw, err := os.ReadFile(registryPath)
			if err == nil && len(raw) > 0 {
				var vaults []config.VaultEntry
				if json.Unmarshal(raw, &vaults) == nil {
					for _, v := range vaults {
						if strings.HasPrefix(panePath, v.Path) {
							targetVault = v.Name
							break
						}
					}
				}
			}
		}

		if targetVault == "" {
			return
		}

		vaultDir := filepath.Join(config.GetBaseConfigDir(), "vaults", targetVault)
		_, focusInfo := mailbox.GetVaultFocus(vaultDir)
		if focusInfo.IsValid() {
			baseNote := filepath.Base(focusInfo.File)
			fmt.Printf("👓 %s/%s\n", targetVault, baseNote)
			return
		}

		fmt.Printf("👓 %s\n", targetVault)
	},
}

func init() {
	widgetCmd.Flags().StringVarP(&widgetPaneID, "pane", "p", "", "ID del panel de Tmux (por defecto: panel actual)")
}
