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
		// Limitar profundidad a 4 niveles para evitar lentitud
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

func runInstallerTUI() {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#7aa2f7")).
		MarginBottom(1)

	cardStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#414868")).
		Padding(1, 2).
		MarginBottom(1)

	successStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#9ece6a"))

	dimStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#565f89"))

	fmt.Println(titleStyle.Render("🧠 OBSITRACER MASTER ORCHESTRATOR & INSTALLER"))

	// 1. Escaneo de Vaults
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
		fmt.Println(dimStyle.Render("No se seleccionó ningún Vault."))
		return
	}

	// 2. Proceso de compilación y despliegue
	repoDir, _ := os.Getwd()
	home, _ := os.UserHomeDir()

	err := spinner.New().
		Title("Desplegando componentes (Plugin Tmux, Motor Go y Vaults)...").
		Action(func() {
			// A. Empaquetar TypeScript
			tsCmd := exec.Command("esbuild", "main.ts", "--bundle", "--platform=node", "--external:obsidian", "--external:electron", "--format=cjs", "--target=es2018", "--outfile=main.js")
			tsCmd.Dir = filepath.Join(repoDir, "obsitracer")
			_ = tsCmd.Run()

			// B. Instalar Plugin autónomo de Tmux
			tmuxPluginDir := filepath.Join(home, ".tmux", "plugins", "obsitracer")
			_ = os.MkdirAll(filepath.Join(tmuxPluginDir, "scripts"), 0755)
			_ = os.Symlink(filepath.Join(repoDir, "tmux", "obsitracer.tmux"), filepath.Join(tmuxPluginDir, "obsitracer.tmux"))
			_ = os.Symlink(filepath.Join(repoDir, "tmux", "scripts", "obsitracer.sh"), filepath.Join(tmuxPluginDir, "scripts", "obsitracer.sh"))
			_ = os.Symlink(filepath.Join(repoDir, "tmux", "scripts", "obsitracer-select.sh"), filepath.Join(tmuxPluginDir, "scripts", "obsitracer-select.sh"))
			_ = os.Chmod(filepath.Join(tmuxPluginDir, "obsitracer.tmux"), 0755)
			_ = os.Chmod(filepath.Join(tmuxPluginDir, "scripts", "obsitracer.sh"), 0755)
			_ = os.Chmod(filepath.Join(tmuxPluginDir, "scripts", "obsitracer-select.sh"), 0755)

			// C. Instalar Plugin en Antigravity
			agyPluginDir := filepath.Join(home, ".gemini", "antigravity-cli", "plugins", "obsitracer")
			geminiPluginDir := filepath.Join(home, ".gemini", "config", "plugins", "obsitracer")
			_ = os.MkdirAll(filepath.Dir(agyPluginDir), 0755)
			_ = os.MkdirAll(filepath.Dir(geminiPluginDir), 0755)
			_ = os.Remove(agyPluginDir)
			_ = os.Remove(geminiPluginDir)
			_ = os.Symlink(filepath.Join(repoDir, "plugins", "obsitracer"), agyPluginDir)
			_ = os.Symlink(filepath.Join(repoDir, "plugins", "obsitracer"), geminiPluginDir)

			// D. Vincular Vaults y generar vaults.json
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

			// E. Recargar Tmux si aplica
			if tmux.IsInsideTmux() {
				tmux.RefreshClient()
			}
		}).
		Run()

	if err != nil {
		fmt.Printf("Error durante la instalación: %v\n", err)
		return
	}

	// 3. Banner de Éxito
	summary := fmt.Sprintf("%s\n\n%s\n  • %s %s\n  • %s %s\n  • %s %s\n\n%s\n  • %s Registrados: %d vaults",
		successStyle.Render("🎉 ¡Obsitracer se ha instalado y vinculado exitosamente!"),
		titleStyle.Render("Atajos de Teclado:"),
		lipgloss.NewStyle().Bold(true).Render("Alt + o"), dimStyle.Render("➔ Selector rápido en Tmux"),
		lipgloss.NewStyle().Bold(true).Render("Ctrl+a ➔ o"), dimStyle.Render("➔ Selector alternativo con prefijo"),
		lipgloss.NewStyle().Bold(true).Render("obsitracer"), dimStyle.Render("➔ CLI para gestionar foco y estado"),
		titleStyle.Render("Vaults Vinculados:"),
		lipgloss.NewStyle().Foreground(lipgloss.Color("#9ece6a")).Render("✔"), len(selectedVaults),
	)

	fmt.Println(cardStyle.Render(summary))
}
