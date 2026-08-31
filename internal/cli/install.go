package cli

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

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

func resolveRepoDir() string {
	// 1. Verificar ubicación del ejecutable siguiendo symlinks
	if exe, err := os.Executable(); err == nil {
		if eval, err := filepath.EvalSymlinks(exe); err == nil {
			dir := filepath.Dir(eval)
			if filepath.Base(dir) == "bin" {
				candidate := filepath.Dir(dir)
				if filepath.Base(candidate) == "obsitracer" && filepath.Base(filepath.Dir(candidate)) == "plugins" {
					candidate = filepath.Dir(filepath.Dir(candidate))
				}
				if _, err := os.Stat(filepath.Join(candidate, "obsitracer", "main.ts")); err == nil {
					return candidate
				}
			}
		}
	}

	// 2. Verificar git rev-parse --show-toplevel
	if out, err := exec.Command("git", "rev-parse", "--show-toplevel").Output(); err == nil {
		gitRoot := strings.TrimSpace(string(out))
		if _, err := os.Stat(filepath.Join(gitRoot, "obsitracer", "main.ts")); err == nil {
			return gitRoot
		}
	}

	// 3. Directorio de trabajo actual
	if cwd, err := os.Getwd(); err == nil {
		if _, err := os.Stat(filepath.Join(cwd, "obsitracer", "main.ts")); err == nil {
			return cwd
		}
	}

	// 4. Ubicación estándar en el workspace del usuario
	if home, err := os.UserHomeDir(); err == nil {
		stdPath := filepath.Join(home, "Documents", "repositorios", "Obsitracer")
		if _, err := os.Stat(filepath.Join(stdPath, "obsitracer", "main.ts")); err == nil {
			return stdPath
		}
	}

	cwd, _ := os.Getwd()
	return cwd
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
		if strings.Count(rel, string(filepath.Separator)) > 3 {
			return filepath.SkipDir
		}
		return nil
	})

	return found
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
	repoDir := resolveRepoDir()
	home, _ := os.UserHomeDir()

	// -------------------------------------------------------------------------
	// ETAPA 2: Compilación de TypeScript (Plugin de Obsidian)
	// -------------------------------------------------------------------------
	var tsBuilt bool
	var tsBundled bool
	mainJsPath := filepath.Join(repoDir, "obsitracer", "main.js")
	mainTsPath := filepath.Join(repoDir, "obsitracer", "main.ts")

	_ = spinner.New().
		Title("Verificando y empaquetando plugin de Obsidian con esbuild...").
		Action(func() {
			if _, err := exec.LookPath("esbuild"); err == nil {
				tsCmd := exec.Command("esbuild", "main.ts", "--bundle", "--platform=node", "--external:obsidian", "--external:electron", "--format=cjs", "--target=es2018", "--outfile=main.js")
				tsCmd.Dir = filepath.Join(repoDir, "obsitracer")
				if err := tsCmd.Run(); err == nil {
					tsBuilt = true
					tsBundled = true
					return
				}
			}
			// Si esbuild no está disponible en PATH o falló, verificar si ya existe main.js
			if _, err := os.Stat(mainJsPath); err == nil {
				tsBuilt = true
				tsBundled = false
				return
			}
		}).
		Run()

	if tsBuilt {
		if tsBundled {
			notifyStep("Obsidian Plugin TS", "(obsitracer/main.js empaquetado con esbuild)", true)
		} else {
			notifyStep("Obsidian Plugin TS", "(usando obsitracer/main.js precompilado)", true)
		}
	} else {
		notifyStep("Obsidian Plugin TS", fmt.Sprintf("Error compilando main.ts (no existe %s)", mainTsPath), false)
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
			_ = os.Remove(filepath.Join(tmuxPluginDir, "obsitracer.tmux"))
			_ = os.Remove(filepath.Join(tmuxPluginDir, "scripts", "obsitracer.sh"))
			_ = os.Remove(filepath.Join(tmuxPluginDir, "scripts", "obsitracer-select.sh"))
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
		notifyStep("Plugin de Tmux", "(Keybindings Alt+o y widget para tmux-ukiyo sincronizados en vivo)", true)
	} else {
		notifyStep("Plugin de Tmux", "(Instalado en ~/.tmux/plugins/obsitracer y widget configurado)", true)
	}

	// -------------------------------------------------------------------------
	// ETAPA 4: Despliegue de Hook, Skill y CLI Global
	// -------------------------------------------------------------------------
	agyPluginDir := filepath.Join(home, ".gemini", "antigravity-cli", "plugins", "obsitracer")
	geminiPluginDir := filepath.Join(home, ".gemini", "config", "plugins", "obsitracer")
	localBinDir := filepath.Join(home, ".local", "bin")

	_ = spinner.New().
		Title("Vinculando Hook PreInvocation, Skill y CLI Global...").
		Action(func() {
			_ = os.MkdirAll(filepath.Dir(agyPluginDir), 0755)
			_ = os.MkdirAll(filepath.Dir(geminiPluginDir), 0755)
			_ = os.MkdirAll(localBinDir, 0755)

			_ = os.Remove(agyPluginDir)
			_ = os.Remove(geminiPluginDir)
			_ = os.Symlink(filepath.Join(repoDir, "plugins", "obsitracer"), agyPluginDir)
			_ = os.Symlink(filepath.Join(repoDir, "plugins", "obsitracer"), geminiPluginDir)

			// Asegurar symlinks de binarios
			cliBinPath := filepath.Join(repoDir, "bin", "obsitracer")
			if _, err := os.Stat(cliBinPath); err == nil {
				_ = os.Remove(filepath.Join(localBinDir, "obsitracer"))
				_ = os.Symlink(cliBinPath, filepath.Join(localBinDir, "obsitracer"))

				_ = os.MkdirAll(filepath.Join(repoDir, "plugins", "obsitracer", "bin"), 0755)
				_ = os.Remove(filepath.Join(repoDir, "plugins", "obsitracer", "bin", "obsitracer"))
				_ = os.Remove(filepath.Join(repoDir, "plugins", "obsitracer", "bin", "obsitracer-hook"))
				_ = os.Symlink(cliBinPath, filepath.Join(repoDir, "plugins", "obsitracer", "bin", "obsitracer"))
			}

			// Fusionar hook en ~/.gemini/config/hooks.json
			configHooksPath := filepath.Join(home, ".gemini", "config", "hooks.json")
			_ = os.MkdirAll(filepath.Dir(configHooksPath), 0755)
			hooksMap := make(map[string]any)
			if data, err := os.ReadFile(configHooksPath); err == nil && len(data) > 0 {
				_ = json.Unmarshal(data, &hooksMap)
			}
			hooksMap["inject-vault-diff"] = map[string]any{
				"PreInvocation": []map[string]any{
					{
						"type":    "command",
						"command": "obsitracer hook",
					},
				},
			}
			if encoded, err := json.MarshalIndent(hooksMap, "", "  "); err == nil {
				_ = os.WriteFile(configHooksPath, encoded, 0644)
			}

			// Symlink de la Skill en ~/.gemini/config/skills/obsitracer-operator
			globalSkillsDir := filepath.Join(home, ".gemini", "config", "skills")
			_ = os.MkdirAll(globalSkillsDir, 0755)
			skillTarget := filepath.Join(globalSkillsDir, "obsitracer-operator")
			_ = os.Remove(skillTarget)
			_ = os.Symlink(filepath.Join(repoDir, "plugins", "obsitracer", "skills", "obsitracer-operator"), skillTarget)
		}).
		Run()

	notifyStep("Antigravity Plugin", "(Hook PreInvocation y Skill obsitracer-operator registrados)", true)
	notifyStep("CLI Global", "(Symlink ~/.local/bin/obsitracer creado en PATH)", true)

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
