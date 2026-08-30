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
