package cli

import (
	"fmt"
	"strings"

	"obsitracer/internal/terminal"

	"github.com/spf13/cobra"
)

var (
	targetPaneID string
	clearTarget  bool
)

var targetCmd = &cobra.Command{
	Use:   "target [vault_name]",
	Short: "Sintoniza o consulta el Vault objetivo en el entorno actual (Kitty / Tmux)",
	Run: func(cmd *cobra.Command, args []string) {
		if clearTarget {
			if err := terminal.ClearTarget(targetPaneID); err != nil {
				fmt.Println("Error al apagar el foco:", err)
				return
			}
			terminal.DisplayMessage(targetPaneID, "Obsitracer: Foco apagado")
			fmt.Println("Foco apagado.")
			return
		}

		if len(args) == 0 {
			currentTarget := terminal.GetTarget(targetPaneID)
			if currentTarget == "" {
				fmt.Println("Ningún foco activo en este panel/ventana.")
			} else {
				fmt.Printf("Foco actual: %s\n", currentTarget)
			}
			return
		}

		vaultName := strings.TrimSpace(args[0])
		if err := terminal.SetTarget(targetPaneID, vaultName); err != nil {
			fmt.Println("Error al sintonizar foco:", err)
			return
		}

		terminal.DisplayMessage(targetPaneID, fmt.Sprintf("Obsitracer: Foco sintonizado a [%s]", vaultName))
		fmt.Printf("Foco sintonizado a [%s].\n", vaultName)
	},
}

var clearCmd = &cobra.Command{
	Use:   "clear",
	Short: "Apaga / silencia el foco de atención en el entorno actual (Kitty / Tmux)",
	Run: func(cmd *cobra.Command, args []string) {
		if err := terminal.ClearTarget(targetPaneID); err != nil {
			fmt.Println("Error al apagar el foco:", err)
			return
		}
		terminal.DisplayMessage(targetPaneID, "Obsitracer: Foco apagado")
		fmt.Println("Foco apagado.")
	},
}

func init() {
	targetCmd.Flags().StringVarP(&targetPaneID, "pane", "p", "", "ID del panel de Tmux (por defecto: panel actual)")
	targetCmd.Flags().BoolVarP(&clearTarget, "clear", "c", false, "Apagar / silenciar el foco")
	clearCmd.Flags().StringVarP(&targetPaneID, "pane", "p", "", "ID del panel de Tmux (por defecto: panel actual)")
}
