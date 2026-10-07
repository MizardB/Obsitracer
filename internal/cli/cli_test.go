package cli

import (
	"bytes"
	"os"
	"testing"
)

func TestRootCommand(t *testing.T) {
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"--help"})

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("Error ejecutando rootCmd --help: %v", err)
	}

	out := b.String()
	if len(out) == 0 {
		t.Fatal("Esperaba salida de ayuda de rootCmd, pero fue vacía")
	}
}

func TestTargetCommand(t *testing.T) {
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"target", "--help"})

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("Error ejecutando targetCmd --help: %v", err)
	}
}

func TestHookCommandEmptyStdin(t *testing.T) {
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}

	oldStdin := os.Stdin
	defer func() { os.Stdin = oldStdin }()
	os.Stdin = r

	_ = w.Close()

	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"hook"})

	err = rootCmd.Execute()
	if err != nil {
		t.Fatalf("Error ejecutando hook: %v", err)
	}
}

func TestSessionTargetCLI(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-cli-session-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	sessionID := "test-session-pi"

	// 1. Set session target
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"target", "--session", sessionID, "Cortex"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Error setting session target: %v", err)
	}

	// 2. Query session target (raw)
	b.Reset()
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"target", "--session", sessionID, "--raw"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Error querying session target raw: %v", err)
	}

	// 3. Clear session target
	b.Reset()
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"clear", "--session", sessionID})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Error clearing session target: %v", err)
	}
}

func TestVaultsCommand(t *testing.T) {
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"vaults", "--help"})

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("Error ejecutando vaults --help: %v", err)
	}
}
