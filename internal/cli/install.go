package cli

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"

	"obsitracer/internal/config"
	"obsitracer/internal/tmux"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/huh/spinner"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Ejecuta el instalador interactivo TUI para configurar Obsitracer",
	Run: func(cmd *cobra.Command, args []string) {
		runInstallerTUI()
	},
}

func scanForVaults() []string {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}

	searchRoot := filepath.Join(home, "Documents")
	var found []string

	_ = filepath.WalkDir(searchRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && d.Name() == ".obsidian" {
			vaultPath := filepath.Dir(path)
			found = append(found, vaultPath)
			return filepath.SkipDir
		}
		rel, _ := filepath.Rel(searchRoot, path)
		if stringsCount(rel, string(filepath.Separator)) > 3 {
			return filepath.SkipDir
		}
		return nil
	})

	return found
}

func stringsCount(s, substr string) int {
	count := 0
	for i := 0; i < len(s); i++ {
		if string(s[i]) == substr {
			count++
		}
	}
	return count
}

func notifyStep(title, detail string, isOk bool) {
	icon := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#9ece6a")).Render("  [✔]")
	if !isOk {
		icon = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#f7768e")).Render("  [✕]")
	}
	titleStyled := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#c0caf5")).Render(title)
	detailStyled := lipgloss.NewStyle().Foreground(lipgloss.Color("#565f89")).Render(detail)

	fmt.Printf("%s %s %s\n", icon, titleStyled, detailStyled)
}

func runInstallerTUI() {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#7aa2f7")).
		MarginBottom(1)

	cardStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#414868")).
		Padding(1, 2).
		MarginTop(1)

	successStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#9ece6a"))

	dimStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#565f89"))

	fmt.Println(titleStyle.Render("🧠 OBSITRACER MASTER ORCHESTRATOR & INSTALLER"))

	// -------------------------------------------------------------------------
	// ETAPA 1: Escaneo y Selección de Vaults
	// -------------------------------------------------------------------------
	var discoveredVaults []string
	_ = spinner.New().
		Title("Escaneando directorios en ~/Documents buscando Vaults de Obsidian...").
		Action(func() {
			discoveredVaults = scanForVaults()
		}).
		Run()

	var selectedVaults []string
	var options []huh.Option[string]

	for _, v := range discoveredVaults {
		name := filepath.Base(v)
		label := fmt.Sprintf("📁 %-16s (%s)", name, v)
		options = append(options, huh.NewOption(label, v).Selected(true))
	}

	if len(options) == 0 {
		fmt.Println(dimStyle.Render("No se encontraron Vaults con directorio .obsidian en ~/Documents."))
		return
	}

	form := huh.NewForm(
		huh.NewGroup(
			huh.NewMultiSelect[string]().
				Title("Selecciona los Vaults de Obsidian para vincular Obsitracer").
				Description("[Espacio] Marcar/Desmarcar  •  [Enter] Confirmar selección").
				Options(options...).
				Value(&selectedVaults),
		),
	).WithTheme(huh.ThemeCatppuccin())

	if err := form.Run(); err != nil {
		fmt.Println("Instalación cancelada.")
		return
	}

	if len(selectedVaults) == 0 {
		fmt.Println(dimStyle.Render("No se seleccionó ningún Vault. Cancelando."))
		return
	}

	fmt.Println()
	repoDir, _ := os.Getwd()
	home, _ := os.UserHomeDir()

	// -------------------------------------------------------------------------
	// ETAPA 2: Compilación de TypeScript (Plugin de Obsidian)
	// -------------------------------------------------------------------------
	var tsErr error
	_ = spinner.New().
		Title("Empaquetando plugin de Obsidian con esbuild...").
		Action(func() {
			tsCmd := exec.Command("esbuild", "main.ts", "--bundle", "--platform=node", "--external:obsidian", "--external:electron", "--format=cjs", "--target=es2018", "--outfile=main.js")
			tsCmd.Dir = filepath.Join(repoDir, "obsitracer")
			tsErr = tsCmd.Run()
		}).
		Run()

	if tsErr != nil {
		notifyStep("Obsidian Plugin TS", "Error compilando main.ts", false)
	} else {
		notifyStep("Obsidian Plugin TS", "(obsitracer/main.js empaquetado)", true)
	}

	// -------------------------------------------------------------------------
	// ETAPA 3: Instalación y Recarga de Tmux
	// -------------------------------------------------------------------------
	var tmuxAlreadyInstalled bool
	tmuxPluginDir := filepath.Join(home, ".tmux", "plugins", "obsitracer")
	if _, err := os.Stat(filepath.Join(tmuxPluginDir, "obsitracer.tmux")); err == nil {
		tmuxAlreadyInstalled = true
	}

	_ = spinner.New().
		Title("Desplegando y recargando Plugin autónomo de Tmux...").
		Action(func() {
			_ = os.MkdirAll(filepath.Join(tmuxPluginDir, "scripts"), 0755)
			_ = os.Symlink(filepath.Join(repoDir, "tmux", "obsitracer.tmux"), filepath.Join(tmuxPluginDir, "obsitracer.tmux"))
			_ = os.Symlink(filepath.Join(repoDir, "tmux", "scripts", "obsitracer.sh"), filepath.Join(tmuxPluginDir, "scripts", "obsitracer.sh"))
			_ = os.Symlink(filepath.Join(repoDir, "tmux", "scripts", "obsitracer-select.sh"), filepath.Join(tmuxPluginDir, "scripts", "obsitracer-select.sh"))
			_ = os.Chmod(filepath.Join(tmuxPluginDir, "obsitracer.tmux"), 0755)
			_ = os.Chmod(filepath.Join(tmuxPluginDir, "scripts", "obsitracer.sh"), 0755)
			_ = os.Chmod(filepath.Join(tmuxPluginDir, "scripts", "obsitracer-select.sh"), 0755)

			// Recargar Tmux en caliente si el servidor está corriendo
			if tmux.IsInsideTmux() {
				_ = exec.Command("tmux", "run-shell", filepath.Join(tmuxPluginDir, "obsitracer.tmux")).Run()
				tmux.RefreshClient()
				tmux.DisplayMessage("", "Obsitracer: Plugin de Tmux recargado y activo")
			}
		}).
		Run()

	if tmuxAlreadyInstalled {
		notifyStep("Plugin de Tmux", "(Actualizado, recargado y sintonizado en caliente)", true)
	} else {
		notifyStep("Plugin de Tmux", "(Instalado en ~/.tmux/plugins/obsitracer y cargado en vivo)", true)
	}

	// -------------------------------------------------------------------------
	// ETAPA 4: Despliegue de Hook y Skill en Antigravity
	// -------------------------------------------------------------------------
	agyPluginDir := filepath.Join(home, ".gemini", "antigravity-cli", "plugins", "obsitracer")
	geminiPluginDir := filepath.Join(home, ".gemini", "config", "plugins", "obsitracer")

	_ = spinner.New().
		Title("Vinculando Hook PreInvocation y Skill en Antigravity...").
		Action(func() {
			_ = os.MkdirAll(filepath.Dir(agyPluginDir), 0755)
			_ = os.MkdirAll(filepath.Dir(geminiPluginDir), 0755)
			_ = os.Remove(agyPluginDir)
			_ = os.Remove(geminiPluginDir)
			_ = os.Symlink(filepath.Join(repoDir, "plugins", "obsitracer"), agyPluginDir)
			_ = os.Symlink(filepath.Join(repoDir, "plugins", "obsitracer"), geminiPluginDir)
		}).
		Run()

	notifyStep("Antigravity Plugin", "(Hook PreInvocation y Skill obsitracer-operator registrados)", true)

	// -------------------------------------------------------------------------
	// ETAPA 5: Vinculación de Vaults y Registro JSON
	// -------------------------------------------------------------------------
	_ = spinner.New().
		Title(fmt.Sprintf("Vinculando plugin en %d Vaults y creando buzones...", len(selectedVaults))).
		Action(func() {
			var entries []config.VaultEntry
			for _, vPath := range selectedVaults {
				vName := filepath.Base(vPath)
				entries = append(entries, config.VaultEntry{Name: vName, Path: vPath})

				// Symlink en .obsidian/plugins/obsitracer
				targetDir := filepath.Join(vPath, ".obsidian", "plugins", "obsitracer")
				_ = os.MkdirAll(filepath.Join(vPath, ".obsidian", "plugins"), 0755)
				_ = os.RemoveAll(targetDir)
				_ = os.Symlink(filepath.Join(repoDir, "obsitracer"), targetDir)

				// Buzón
				_ = os.MkdirAll(filepath.Join(config.GetBaseConfigDir(), "vaults", vName), 0755)
			}

			_ = os.MkdirAll(config.GetBaseConfigDir(), 0755)
			rawJSON, _ := json.MarshalIndent(entries, "", "  ")
			_ = os.WriteFile(config.GetVaultsRegistryPath(), rawJSON, 0644)
		}).
		Run()

	notifyStep("Obsidian Vaults", fmt.Sprintf("(%d vaults vinculados e indexados en vaults.json)", len(selectedVaults)), true)

	// -------------------------------------------------------------------------
	// RESUMEN FINAL
	// -------------------------------------------------------------------------
	summary := fmt.Sprintf("%s\n\n%s\n  • %s %s\n  • %s %s\n  • %s %s\n\n%s\n  • %s Registrados y activos: %d vaults",
		successStyle.Render("🎉 ¡Obsitracer está 100% operativo y sincronizado!"),
		titleStyle.Render("Atajos de Teclado:"),
		lipgloss.NewStyle().Bold(true).Render("Alt + o"), dimStyle.Render("➔ Selector interactivo en Tmux"),
		lipgloss.NewStyle().Bold(true).Render("Ctrl+a ➔ o"), dimStyle.Render("➔ Selector alternativo con prefijo"),
		lipgloss.NewStyle().Bold(true).Render("obsitracer"), dimStyle.Render("➔ CLI para gestionar foco, target y estado"),
		titleStyle.Render("Vaults Configurados:"),
		lipgloss.NewStyle().Foreground(lipgloss.Color("#9ece6a")).Render("✔"), len(selectedVaults),
	)

	fmt.Println(cardStyle.Render(summary))
}
