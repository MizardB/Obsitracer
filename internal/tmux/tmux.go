package tmux

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"strings"
	"time"
)

func GetTmuxTarget(paneID string) string {
	pane := paneID
	if pane == "" {
		pane = os.Getenv("TMUX_PANE")
		if pane == "" {
			pane = "."
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	// 1. Intentar nivel de panel (-p)
	cmd := exec.CommandContext(ctx, "tmux", "show-option", "-p", "-t", pane, "-qv", "@obsitracer_target")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		target := strings.TrimSpace(out.String())
		if target != "" {
			return target
		}
	}

	// 2. Fallback a nivel de ventana (-t)
	out.Reset()
	cmd = exec.CommandContext(ctx, "tmux", "show-option", "-t", pane, "-qv", "@obsitracer_target")
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		return strings.TrimSpace(out.String())
	}

	return ""
}
