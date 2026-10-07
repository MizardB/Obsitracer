package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"obsitracer/internal/config"
	"obsitracer/internal/mailbox"
	"obsitracer/internal/scanner"
	"obsitracer/internal/terminal"

	"github.com/spf13/cobra"
)

var (
	targetPaneID    string
	targetSessionID string
	clearTarget     bool
	rawOutput       bool
)

func resetVaultTelemetry(vaultName string) {
	if vaultName == "" {
		return
	}
	vaultDir := filepath.Join(config.GetBaseConfigDir(), "vaults", vaultName)
	crudFile := filepath.Join(vaultDir, "crud.json")
	manifestFile := filepath.Join(vaultDir, "manifest.json")

	vaultPath, _ := mailbox.GetVaultFocus(vaultDir)
	if vaultPath == "" {
		registryPath := config.GetVaultsRegistryPath()
		if raw, err := os.ReadFile(registryPath); err == nil {
			var list []config.VaultEntry
			if err := json.Unmarshal(raw, &list); err == nil {
				for _, v := range list {
					if v.Name == vaultName {
						vaultPath = v.Path
						break
					}
				}
			}
		}
	}

	// 1. Drain / clear crud.json discarding all stale events prior to tuning
	mailbox.ResetCRUDMailbox(crudFile, vaultPath)

	// 2. Sync dirtree into manifest.json so baseline anchors at t=0
	if vaultPath != "" {
		if st, err := os.Stat(vaultPath); err == nil && st.IsDir() {
			tree := scanner.ScanDirtree(vaultPath)
			mailbox.SaveManifest(manifestFile, tree)
		}
	}
}

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
			winID := targetPaneID
			if winID == "" && terminal.IsInsideKitty() {
				winID = os.Getenv("KITTY_WINDOW_ID")
			}
			if winID != "" {
				if sess := terminal.GetKittyWindowSession(winID); sess != "" {
					_ = terminal.ClearSessionTarget(sess)
				}
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
			resetVaultTelemetry(vaultName)
			terminal.DisplayMessage(targetPaneID, fmt.Sprintf("Obsitracer: Foco sintonizado a [%s]", vaultName))
			fmt.Printf("Foco sintonizado a [%s].\n", vaultName)
			return
		}

		if err := terminal.SetTarget(targetPaneID, vaultName); err != nil {
			fmt.Println("Error al sintonizar foco:", err)
			return
		}
		winID := targetPaneID
		if winID == "" && terminal.IsInsideKitty() {
			winID = os.Getenv("KITTY_WINDOW_ID")
		}
		if winID != "" {
			if sess := terminal.GetKittyWindowSession(winID); sess != "" {
				_ = terminal.SetSessionTarget(sess, vaultName)
			}
		}
		resetVaultTelemetry(vaultName)

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
		winID := targetPaneID
		if winID == "" && terminal.IsInsideKitty() {
			winID = os.Getenv("KITTY_WINDOW_ID")
		}
		if winID != "" {
			if sess := terminal.GetKittyWindowSession(winID); sess != "" {
				_ = terminal.ClearSessionTarget(sess)
			}
		}
		terminal.DisplayMessage(targetPaneID, "Obsitracer: Foco apagado")
		fmt.Println("Foco apagado.")
	},
}

func init() {
	targetCmd.PreRun = func(cmd *cobra.Command, args []string) {
		if !cmd.Flags().Changed("session") {
			targetSessionID = ""
		}
		if !cmd.Flags().Changed("pane") {
			targetPaneID = ""
		}
		if !cmd.Flags().Changed("clear") {
			clearTarget = false
		}
		if !cmd.Flags().Changed("raw") {
			rawOutput = false
		}
	}

	clearCmd.PreRun = func(cmd *cobra.Command, args []string) {
		if !cmd.Flags().Changed("session") {
			targetSessionID = ""
		}
		if !cmd.Flags().Changed("pane") {
			targetPaneID = ""
		}
	}

	targetCmd.Flags().StringVarP(&targetPaneID, "pane", "p", "", "ID del panel de Tmux (por defecto: panel actual)")
	targetCmd.Flags().StringVarP(&targetSessionID, "session", "s", "", "ID de la sesión (ej. sesión de Pi Coding Agent)")
	targetCmd.Flags().BoolVarP(&clearTarget, "clear", "c", false, "Apagar / silenciar el foco")
	targetCmd.Flags().BoolVar(&rawOutput, "raw", false, "Imprimir sólo el nombre de la bóveda sin formato")

	clearCmd.Flags().StringVarP(&targetPaneID, "pane", "p", "", "ID del panel de Tmux (por defecto: panel actual)")
	clearCmd.Flags().StringVarP(&targetSessionID, "session", "s", "", "ID de la sesión (ej. sesión de Pi Coding Agent)")
}
