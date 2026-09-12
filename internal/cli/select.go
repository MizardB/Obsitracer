package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"obsitracer/internal/config"
	"obsitracer/internal/terminal"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/x/term"
	"github.com/spf13/cobra"
)

var (
	selectPaneID    string
	selectTabID     string
	selectWindowIDs string
)

func applySelectTarget(selectedName string) {
	if selectedName == "" {
		return
	}
	_ = terminal.SetTarget(selectPaneID, selectedName)
	if selectTabID != "" {
		_ = terminal.SetTabTarget(selectTabID, selectedName)
	}
	if selectWindowIDs != "" {
		for _, wid := range strings.Split(selectWindowIDs, ",") {
			w := strings.TrimSpace(wid)
			if w != "" {
				_ = terminal.SetTarget(w, selectedName)
			}
		}
	}
	terminal.DisplayMessage(selectPaneID, fmt.Sprintf("Obsitracer: Foco sintonizado a [%s]", selectedName))
}

func clearSelectTarget() {
	_ = terminal.ClearTarget(selectPaneID)
	if selectTabID != "" {
		_ = terminal.ClearTabTarget(selectTabID)
	}
	if selectWindowIDs != "" {
		for _, wid := range strings.Split(selectWindowIDs, ",") {
			w := strings.TrimSpace(wid)
			if w != "" {
				_ = terminal.ClearTarget(w)
			}
		}
	}
	terminal.DisplayMessage(selectPaneID, "Obsitracer: Foco apagado")
}

var selectCmd = &cobra.Command{
	Use:   "select",
	Short: "Abre el selector interactivo TUI para sintonizar el Vault activo (Kitty / Tmux)",
	Run: func(cmd *cobra.Command, args []string) {
		registryPath := config.GetVaultsRegistryPath()
		raw, err := os.ReadFile(registryPath)
		if err != nil || len(raw) == 0 {
			terminal.DisplayMessage(selectPaneID, "Obsitracer: No hay vaults registrados en "+registryPath)
			fmt.Println("No se encontró el registro de vaults.")
			return
		}

		var vaults []config.VaultEntry
		if err := json.Unmarshal(raw, &vaults); err != nil || len(vaults) == 0 {
			terminal.DisplayMessage(selectPaneID, "Obsitracer: No hay vaults válidos registrados")
			fmt.Println("No hay vaults registrados.")
			return
		}

		currentTarget := ""
		if selectTabID != "" {
			currentTarget = terminal.GetTabTarget(selectTabID)
		}
		if currentTarget == "" {
			currentTarget = terminal.GetTarget(selectPaneID)
		}
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

	margin := "8%,15%"
	padding := "1"
	if w, _, err := term.GetSize(os.Stdout.Fd()); err == nil && w <= 95 {
		margin = "0,1"
		padding = "0,1"
	}

	fzfCmd := exec.Command("fzf",
		"--prompt=🧠 Obsitracer > ",
		"--header="+header,
		"--expect=ctrl-x",
		"--delimiter=\t",
		"--with-nth=1,2",
		"--reverse",
		"--border=rounded",
		"--border-label= 🧠 Obsitracer — Sintonizar Vault ",
		"--border-label-pos=3",
		"--margin="+margin,
		"--padding="+padding,
		"--info=inline",
		"--color=border:#7aa2f7,label:bold:#bb9af7,header:italic:#7dcfff,prompt:bold:#e0af68,pointer:bold:#9ece6a,hl:#bb9af7,hl+:#7dcfff",
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
		clearSelectTarget()
		return
	}

	parts := strings.Split(selectedLine, "\t")
	selectedName := strings.TrimPrefix(parts[0], "📁 ")
	selectedName = strings.TrimSpace(selectedName)

	if selectedName != "" {
		applySelectTarget(selectedName)
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
		clearSelectTarget()
	} else {
		applySelectTarget(selected)
	}
}

func init() {
	selectCmd.Flags().StringVarP(&selectPaneID, "pane", "p", "", "ID del panel de Tmux o ventana de Kitty")
	selectCmd.Flags().StringVarP(&selectTabID, "tab", "t", "", "ID de la pestaña de Kitty")
	selectCmd.Flags().StringVar(&selectWindowIDs, "windows", "", "Lista de IDs de ventanas en la pestaña (separadas por coma)")
}
