package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"

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

		// 1. Prioridad: FZF si está disponible en el entorno
		if _, err := exec.LookPath("fzf"); err == nil {
			runFZFSelect(vaults, currentTarget, currentTargetDisplay)
			return
		}

		// 2. Fallback: Huh TUI
		runHuhSelect(vaults, currentTarget, currentTargetDisplay)
	},
}

func runFZFSelect(vaults []config.VaultEntry, currentTarget, currentTargetDisplay string) {
	var sb strings.Builder
	sb.WriteString("[✕] Silenciar / Apagar foco\t(Desactiva inyección de contexto)\n")
	for _, v := range vaults {
		sb.WriteString(fmt.Sprintf("📁 %s\t(%s)\n", v.Name, v.Path))
	}

	header := fmt.Sprintf("Foco actual: %s  •  [Enter] Sintonizar  •  [Ctrl-X] Silenciar  •  [Esc] Salir", currentTargetDisplay)

	fzfCmd := exec.Command("fzf",
		"--prompt=🧠 Obsitracer > ",
		"--header="+header,
		"--expect=ctrl-x",
		"--delimiter=\t",
		"--with-nth=1,2",
		"--reverse",
		"--height=100%",
		"--color=header:italic:cyan,prompt:bold:yellow,pointer:bold:green",
	)

	fzfCmd.Stdin = strings.NewReader(sb.String())
	fzfCmd.Stderr = os.Stderr

	var stdout bytes.Buffer
	fzfCmd.Stdout = &stdout

	if err := fzfCmd.Run(); err != nil {
		// Cancelado por usuario (Esc, Ctrl+C / exit code 130 o 1)
		return
	}

	output := strings.TrimSpace(stdout.String())
	if output == "" {
		return
	}

	lines := strings.Split(output, "\n")
	var keyPress, selectedLine string
	if len(lines) >= 2 {
		keyPress = strings.TrimSpace(lines[0])
		selectedLine = strings.TrimSpace(lines[1])
	} else if len(lines) == 1 {
		selectedLine = strings.TrimSpace(lines[0])
	}

	if keyPress == "ctrl-x" || strings.HasPrefix(selectedLine, "[✕]") {
		_ = tmux.UnsetTmuxTarget(selectPaneID)
		tmux.RefreshClient()
		tmux.DisplayMessage(selectPaneID, "Obsitracer: Foco apagado en este panel")
		return
	}

	parts := strings.Split(selectedLine, "\t")
	selectedName := strings.TrimPrefix(parts[0], "📁 ")
	selectedName = strings.TrimSpace(selectedName)

	if selectedName != "" {
		_ = tmux.SetTmuxTarget(selectPaneID, selectedName)
		tmux.RefreshClient()
		tmux.DisplayMessage(selectPaneID, fmt.Sprintf("Obsitracer: Foco sintonizado a [%s]", selectedName))
	}
}

func runHuhSelect(vaults []config.VaultEntry, currentTarget, currentTargetDisplay string) {
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
}

func init() {
	selectCmd.Flags().StringVarP(&selectPaneID, "pane", "p", "", "ID del panel de Tmux (por defecto: panel actual)")
}
