package cli

import (
	"os"
	"strings"
	"testing"
)

// Inspect the installer source without running its interactive, mutating flow.
// Runtime terminal support lives elsewhere and is intentionally not restricted.
func TestInstallerDoesNotConfigureKitty(t *testing.T) {
	source, err := os.ReadFile("install.go")
	if err != nil {
		t.Fatal(err)
	}

	text := strings.ToLower(string(source))
	for _, forbidden := range []string{
		"kitty", // Paths, commands, configuration messages and KITTY_WINDOW_ID.
		"tab_bar.py",
		"obsitracer_select.py",
		".zshrc",
		".bashrc",
		"trap ",
	} {
		if strings.Contains(text, forbidden) {
			t.Errorf("installer must not configure Kitty or inject shell traps: found %q", forbidden)
		}
	}
}
