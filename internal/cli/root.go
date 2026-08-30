package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "obsitracer",
	Short: "Obsitracer - Cognitive tracking and dynamic context orchestration for Antigravity & Tmux",
	Long: `Obsitracer es el puente cognitivo que conecta tus notas activas en Obsidian
con tu terminal Tmux y Antigravity en tiempo real.`,
	Run: func(cmd *cobra.Command, args []string) {
		// Por defecto, si se invoca sin subcomandos en una terminal interactiva, lanza la TUI
		stat, err := os.Stdin.Stat()
		if err == nil && (stat.Mode()&os.ModeCharDevice) != 0 {
			runInstallerTUI()
		} else {
			_ = cmd.Help()
		}
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(installCmd)
	rootCmd.AddCommand(hookCmd)
	rootCmd.AddCommand(selectCmd)
	rootCmd.AddCommand(targetCmd)
	rootCmd.AddCommand(clearCmd)
	rootCmd.AddCommand(widgetCmd)
	rootCmd.AddCommand(statusCmd)
}
