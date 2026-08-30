package cli

import (
	"encoding/json"
	"fmt"
	"os"

	"obsitracer/internal/config"
	"obsitracer/internal/tmux"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/huh"
	"github.com/spf13/cobra"
)

var selectPaneID string

var selectCmd = &cobra.Command{
	Use:   "select",
	Short: "Abre el selector interactivo TUI para sintonizar el Vault activo en Tmux",
	Run: func(cmd *cobra.Command, args []string) {
		registryPath := config.GetVaultsRegistryPath()
		raw, err := os.ReadFile(registryPath)
		if err != nil || len(raw) == 0 {
			tmux.DisplayMessage(selectPaneID, "Obsitracer: No hay vaults registrados en "+registryPath)
			fmt.Println("No se encontró el registro de vaults.")
			return
		}

		var vaults []config.VaultEntry
		if err := json.Unmarshal(raw, &vaults); err != nil || len(vaults) == 0 {
			tmux.DisplayMessage(selectPaneID, "Obsitracer: No hay vaults válidos registrados")
			fmt.Println("No hay vaults registrados.")
			return
		}

		currentTarget := tmux.GetTmuxTarget(selectPaneID)
		currentTargetDisplay := currentTarget
		if currentTargetDisplay == "" {
			currentTargetDisplay = "Ninguno (Silenciado)"
		}

		var options []huh.Option[string]
		options = append(options, huh.NewOption("[✕] Silenciar / Apagar foco", "__CLEAR__"))

		for _, v := range vaults {
			label := fmt.Sprintf("📁 %-14s (%s)", v.Name, v.Path)
			options = append(options, huh.NewOption(label, v.Name))
		}

		options = append(options, huh.NewOption("[⎋] Cancelar (Mantener actual)", "__CANCEL__"))

		var selected string
		if currentTarget != "" {
			selected = currentTarget
		}

		keymap := huh.NewDefaultKeyMap()
		keymap.Quit = key.NewBinding(
			key.WithKeys("esc", "q", "ctrl+c"),
			key.WithHelp("esc/q", "cancelar"),
		)

		form := huh.NewForm(
			huh.NewGroup(
				huh.NewSelect[string]().
					Title("🧠 Obsitracer - Selector de Vault").
					Description(fmt.Sprintf("Foco actual: %s  •  [Enter] Sintonizar  •  [Esc/q] Cancelar", currentTargetDisplay)).
					Options(options...).
					Height(9).
					Value(&selected),
			),
		).WithTheme(huh.ThemeCatppuccin()).WithKeyMap(keymap)

		if err := form.Run(); err != nil || selected == "__CANCEL__" || selected == "" {
			// Usuario canceló con Ctrl+C / Esc / q / opción Cancelar
			return
		}

		if selected == "__CLEAR__" {
			_ = tmux.UnsetTmuxTarget(selectPaneID)
			tmux.RefreshClient()
			tmux.DisplayMessage(selectPaneID, "Obsitracer: Foco apagado en este panel")
		} else {
			_ = tmux.SetTmuxTarget(selectPaneID, selected)
			tmux.RefreshClient()
			tmux.DisplayMessage(selectPaneID, fmt.Sprintf("Obsitracer: Foco sintonizado a [%s]", selected))
		}
	},
}

func init() {
	selectCmd.Flags().StringVarP(&selectPaneID, "pane", "p", "", "ID del panel de Tmux (por defecto: panel actual)")
}
