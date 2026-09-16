package cli

import (
	"fmt"

	"obsitracer/internal/terminal"

	"github.com/spf13/cobra"
)

var purgeCmd = &cobra.Command{
	Use:   "purge",
	Short: "Elimina targets obsoletos de ventanas/pestañas de Kitty que ya no existen",
	Long: `Consulta las ventanas activas en Kitty via 'kitty @ ls' y elimina los archivos
de target en ~/.config/obsitracer/targets/ cuyos IDs ya no corresponden
a ninguna ventana o pestaña viva. Útil para limpiar manualmente el estado.`,
	Run: func(cmd *cobra.Command, args []string) {
		n := terminal.PurgeStaleTargets()
		if n == 0 {
			fmt.Println("Obsitracer: No hay targets obsoletos. Estado limpio.")
		} else {
			fmt.Printf("Obsitracer: %d target(s) obsoleto(s) purgado(s).\n", n)
		}
	},
}
