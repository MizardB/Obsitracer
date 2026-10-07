package cli

import (
	"fmt"
	"strings"

	"obsitracer/internal/terminal"

	"github.com/spf13/cobra"
)

var (
	targetPaneID    string
	targetSessionID string
	clearTarget     bool
	rawOutput       bool
)

var targetCmd = &cobra.Command{
	Use:   "target [vault_name]",
	Short: "Sintoniza o consulta el Vault objetivo en el entorno actual (Kitty / Tmux / Sesión)",
	Run: func(cmd *cobra.Command, args []string) {
		if clearTarget {
			if targetSessionID != "" {
				if err := terminal.ClearSessionTarget(targetSessionID); err != nil {
					fmt.Println("Error al apagar el foco:", err)
					return
				}
				terminal.DisplayMessage(targetPaneID, "Obsitracer: Foco apagado")
				fmt.Println("Foco apagado.")
				return
			}

			if err := terminal.ClearTarget(targetPaneID); err != nil {
				fmt.Println("Error al apagar el foco:", err)
				return
			}
			terminal.DisplayMessage(targetPaneID, "Obsitracer: Foco apagado")
			fmt.Println("Foco apagado.")
			return
		}

		if len(args) == 0 {
			var currentTarget string
			if targetSessionID != "" {
				currentTarget = terminal.ResolveTarget(targetSessionID, targetPaneID)
			} else {
				currentTarget = terminal.GetTarget(targetPaneID)
			}

			if rawOutput {
				if currentTarget != "" {
					fmt.Println(currentTarget)
				}
				return
			}

			if currentTarget == "" {
				if targetSessionID != "" {
					fmt.Println("Ningún foco activo en esta sesión.")
				} else {
					fmt.Println("Ningún foco activo en este panel/ventana.")
				}
			} else {
				fmt.Printf("Foco actual: %s\n", currentTarget)
			}
			return
		}

		vaultName := strings.TrimSpace(args[0])
		if targetSessionID != "" {
			if err := terminal.SetSessionTarget(targetSessionID, vaultName); err != nil {
				fmt.Println("Error al sintonizar foco:", err)
				return
			}
			terminal.DisplayMessage(targetPaneID, fmt.Sprintf("Obsitracer: Foco sintonizado a [%s]", vaultName))
			fmt.Printf("Foco sintonizado a [%s].\n", vaultName)
			return
		}

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
	Short: "Apaga / silencia el foco de atención en el entorno actual (Kitty / Tmux / Sesión)",
	Run: func(cmd *cobra.Command, args []string) {
		if targetSessionID != "" {
			if err := terminal.ClearSessionTarget(targetSessionID); err != nil {
				fmt.Println("Error al apagar el foco:", err)
				return
			}
			terminal.DisplayMessage(targetPaneID, "Obsitracer: Foco apagado")
			fmt.Println("Foco apagado.")
			return
		}

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
	targetCmd.Flags().StringVarP(&targetSessionID, "session", "s", "", "ID de la sesión (ej. sesión de Pi Coding Agent)")
	targetCmd.Flags().BoolVarP(&clearTarget, "clear", "c", false, "Apagar / silenciar el foco")
	targetCmd.Flags().BoolVar(&rawOutput, "raw", false, "Imprimir sólo el nombre de la bóveda sin formato")

	clearCmd.Flags().StringVarP(&targetPaneID, "pane", "p", "", "ID del panel de Tmux (por defecto: panel actual)")
	clearCmd.Flags().StringVarP(&targetSessionID, "session", "s", "", "ID de la sesión (ej. sesión de Pi Coding Agent)")
}
