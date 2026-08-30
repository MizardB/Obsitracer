package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"obsitracer/internal/config"
	"obsitracer/internal/mailbox"
	"obsitracer/internal/tmux"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Muestra el estado del sistema, Vaults registrados y foco activo",
	Run: func(cmd *cobra.Command, args []string) {
		titleStyle := lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#7aa2f7")).
			MarginBottom(1)

		headerStyle := lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#bb9af7"))

		okStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#9ece6a"))
		dimStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#565f89"))

		fmt.Println(titleStyle.Render("🧠 OBSITRACER - ESTADO DEL SISTEMA"))

		// 1. Foco en Tmux
		target := tmux.GetTmuxTarget("")
		if target == "" {
			fmt.Printf("%s %s\n", headerStyle.Render("Foco activo en Tmux:"), dimStyle.Render("Ninguno (Silenciado)"))
		} else {
			fmt.Printf("%s %s\n", headerStyle.Render("Foco activo en Tmux:"), okStyle.Render(target))
		}

		// 2. Vaults registrados
		registryPath := config.GetVaultsRegistryPath()
		raw, err := os.ReadFile(registryPath)
		var vaults []config.VaultEntry
		if err == nil {
			_ = json.Unmarshal(raw, &vaults)
		}

		fmt.Printf("\n%s (%d registrados):\n", headerStyle.Render("Vaults"), len(vaults))
		for _, v := range vaults {
			vaultDir := filepath.Join(config.GetBaseConfigDir(), "vaults", v.Name)
			_, focus := mailbox.GetVaultFocus(vaultDir)
			focusStr := dimStyle.Render("Sin nota abierta")
			if focus.IsValid() {
				focusStr = okStyle.Render(fmt.Sprintf("%s (L:%d C:%d)", filepath.Base(focus.File), focus.Line, focus.Ch))
			}
			fmt.Printf("  • %-14s %s  ➔  %s\n", v.Name, dimStyle.Render(v.Path), focusStr)
		}

		// 3. Directorios de configuración
		fmt.Printf("\n%s\n", headerStyle.Render("Directorios del Sistema:"))
		fmt.Printf("  • Config / Buzones: %s\n", dimStyle.Render(config.GetBaseConfigDir()))
		fmt.Printf("  • Registro:         %s\n", dimStyle.Render(registryPath))
	},
}
