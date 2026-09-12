package cli

import (
	"fmt"
	"path/filepath"

	"obsitracer/internal/config"
	"obsitracer/internal/mailbox"
	"obsitracer/internal/terminal"

	"github.com/spf13/cobra"
)

var widgetPaneID string

var widgetCmd = &cobra.Command{
	Use:   "widget",
	Short: "Genera el badge de estado para la barra de estado (Kitty / Tmux)",
	Run: func(cmd *cobra.Command, args []string) {
		targetVault := terminal.GetTarget(widgetPaneID)

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
