package tmux

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"strings"
	"time"
)

func resolvePane(paneID string) string {
	if paneID != "" && !strings.HasPrefix(paneID, "#{") {
		return paneID
	}
	pane := os.Getenv("TMUX_PANE")
	if pane != "" {
		return pane
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tmux", "display-message", "-p", "-F", "#{pane_id}")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		p := strings.TrimSpace(out.String())
		if p != "" {
			return p
		}
	}
	return "."
}

func IsInsideTmux() bool {
	return os.Getenv("TMUX") != ""
}

func GetTmuxTarget(paneID string) string {
	pane := resolvePane(paneID)
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

	// 2. Fallback a nivel de ventana (-w)
	out.Reset()
	cmd = exec.CommandContext(ctx, "tmux", "show-option", "-w", "-t", pane, "-qv", "@obsitracer_target")
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		target := strings.TrimSpace(out.String())
		if target != "" {
			return target
		}
	}

	// 3. Fallback genérico de ventana (-t)
	out.Reset()
	cmd = exec.CommandContext(ctx, "tmux", "show-option", "-t", pane, "-qv", "@obsitracer_target")
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		return strings.TrimSpace(out.String())
	}

	return ""
}

func SetTmuxTarget(paneID, target string) error {
	pane := resolvePane(paneID)
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	// Seteamos a nivel de ventana y panel para consistencia total en el workspace
	cmdWin := exec.CommandContext(ctx, "tmux", "set-option", "-w", "-t", pane, "@obsitracer_target", target)
	_ = cmdWin.Run()

	cmdPane := exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", pane, "@obsitracer_target", target)
	return cmdPane.Run()
}

func UnsetTmuxTarget(paneID string) error {
	pane := resolvePane(paneID)
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	// Limpiamos tanto a nivel de ventana como de panel
	cmdWin := exec.CommandContext(ctx, "tmux", "set-option", "-w", "-t", pane, "-u", "@obsitracer_target")
	_ = cmdWin.Run()

	cmdPane := exec.CommandContext(ctx, "tmux", "set-option", "-p", "-t", pane, "-u", "@obsitracer_target")
	return cmdPane.Run()
}

func RefreshClient() {
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "refresh-client", "-S")
	_ = cmd.Run()
}

func DisplayMessage(paneID, message string) {
	pane := resolvePane(paneID)
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "display-message", "-t", pane, message)
	_ = cmd.Run()
}

func GetPaneCommand(paneID string) string {
	pane := resolvePane(paneID)
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "display-message", "-p", "-t", pane, "-F", "#{pane_current_command}")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		return strings.TrimSpace(out.String())
	}
	return ""
}

func GetPanePath(paneID string) string {
	pane := resolvePane(paneID)
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "display-message", "-p", "-t", pane, "-F", "#{pane_current_path}")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		return strings.TrimSpace(out.String())
	}
	return ""
}
