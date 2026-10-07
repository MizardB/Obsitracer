package cli

import (
	"encoding/json"
	"fmt"
	"os"

	"obsitracer/internal/config"

	"github.com/spf13/cobra"
)

var vaultsJSON bool

var vaultsCmd = &cobra.Command{
	Use:   "vaults",
	Short: "Lista los Vaults registrados en Obsitracer",
	Run: func(cmd *cobra.Command, args []string) {
		registryPath := config.GetVaultsRegistryPath()
		data, err := os.ReadFile(registryPath)
		if err != nil {
			if vaultsJSON {
				fmt.Println("[]")
			}
			return
		}

		if vaultsJSON {
			fmt.Println(string(data))
			return
		}

		var vaults []config.VaultEntry
		if err := json.Unmarshal(data, &vaults); err != nil {
			return
		}

		for _, v := range vaults {
			fmt.Println(v.Name)
		}
	},
}

func init() {
	vaultsCmd.Flags().BoolVar(&vaultsJSON, "json", false, "Salida en formato JSON")
}
