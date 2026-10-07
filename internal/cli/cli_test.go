package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"obsitracer/internal/config"
	"obsitracer/internal/mailbox"
	"obsitracer/internal/terminal"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

func resetFlags(cmd *cobra.Command) {
	cmd.Flags().VisitAll(func(f *pflag.Flag) {
		_ = f.Value.Set(f.DefValue)
		f.Changed = false
	})
	for _, c := range cmd.Commands() {
		resetFlags(c)
	}
}

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
	resetFlags(rootCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"target", "--help"})

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("Error ejecutando targetCmd --help: %v", err)
	}
	resetFlags(rootCmd)
}

func TestHookCommandEmptyStdin(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-cli-hook-empty-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

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
	resetFlags(rootCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"target", "--session", sessionID, "Cortex"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Error setting session target: %v", err)
	}

	// 2. Query session target (raw)
	resetFlags(rootCmd)
	b.Reset()
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"target", "--session", sessionID, "--raw"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Error querying session target raw: %v", err)
	}

	// 3. Clear session target
	resetFlags(rootCmd)
	b.Reset()
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"clear", "--session", sessionID})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Error clearing session target: %v", err)
	}
}

func TestVaultsCommand(t *testing.T) {
	resetFlags(rootCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"vaults", "--help"})

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("Error ejecutando vaults --help: %v", err)
	}
	resetFlags(rootCmd)
}

func TestTargetCommand_ResetsTelemetry(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-cli-target-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	// Create a real vault folder with sample files
	vaultDir := filepath.Join(tempDir, "Documents", "TestVault")
	if err := os.MkdirAll(vaultDir, 0755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(vaultDir, "Nota1.md"), []byte("# Nota 1"), 0644)
	_ = os.WriteFile(filepath.Join(vaultDir, "Nota2.md"), []byte("# Nota 2"), 0644)

	// Register vault in vaults.json
	baseConfig := filepath.Join(tempDir, ".config", "obsitracer")
	if err := os.MkdirAll(baseConfig, 0755); err != nil {
		t.Fatal(err)
	}
	vaultsRegistry := filepath.Join(baseConfig, "vaults.json")
	_ = os.WriteFile(vaultsRegistry, []byte(`[{"name":"TestVault","path":"`+vaultDir+`"}]`), 0644)

	// Seed crud.json with stale accumulated changes
	vaultMailbox := filepath.Join(baseConfig, "vaults", "TestVault")
	if err := os.MkdirAll(vaultMailbox, 0755); err != nil {
		t.Fatal(err)
	}
	crudFile := filepath.Join(vaultMailbox, "crud.json")
	_ = os.WriteFile(crudFile, []byte(`{
		"ts": "2026-10-07T00:00:00Z",
		"vault": "`+vaultDir+`",
		"changes": [
			{"path": "Nota1.md", "op": "modified"},
			{"path": "OldOffline.md", "op": "created"}
		],
		"ia_blocks": []
	}`), 0644)

	// Set target
	resetFlags(rootCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"target", "TestVault"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Error running target command: %v", err)
	}

	// 1. Verify crud.json was drained/reset
	changes, _ := mailbox.DrainCRUDMailbox(crudFile)
	if len(changes) != 0 {
		t.Errorf("expected crud.json to be cleared, but found %d changes", len(changes))
	}

	// 2. Verify manifest.json was created with baseline t=0 tree
	manifestFile := filepath.Join(vaultMailbox, "manifest.json")
	manifestTree, isFirstRun := mailbox.LoadManifest(manifestFile)
	if isFirstRun {
		t.Fatalf("expected manifest.json to exist after target set")
	}
	if _, ok := manifestTree["Nota1.md"]; !ok {
		t.Errorf("expected Nota1.md in baseline manifest")
	}
	if _, ok := manifestTree["Nota2.md"]; !ok {
		t.Errorf("expected Nota2.md in baseline manifest")
	}
}

func TestHookCommand_SessionStart_TelemetryReset(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-cli-hook-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	vaultDir := filepath.Join(tempDir, "Documents", "TestVault")
	if err := os.MkdirAll(vaultDir, 0755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(vaultDir, "Nota1.md"), []byte("# Nota 1"), 0644)

	baseConfig := filepath.Join(tempDir, ".config", "obsitracer")
	vaultMailbox := filepath.Join(baseConfig, "vaults", "TestVault")
	if err := os.MkdirAll(vaultMailbox, 0755); err != nil {
		t.Fatal(err)
	}

	// Focus info
	focusFile := filepath.Join(vaultMailbox, "focus.json")
	_ = os.WriteFile(focusFile, []byte(`{
		"ts": "2026-10-07T12:00:00Z",
		"vault": "TestVault",
		"vaultPath": "`+vaultDir+`",
		"focus": {
			"file": "Nota1.md",
			"line": 15,
			"ch": 3
		}
	}`), 0644)

	// Stale crud changes and an IA block
	crudFile := filepath.Join(vaultMailbox, "crud.json")
	_ = os.WriteFile(crudFile, []byte(`{
		"ts": "2026-10-07T00:00:00Z",
		"vault": "`+vaultDir+`",
		"changes": [
			{"path": "OldOffline1.md", "op": "created"},
			{"path": "OldOffline2.md", "op": "modified"}
		],
		"ia_blocks": [
			{"file": "Nota1.md", "line": 15, "prompt": "Genera el resumen"}
		]
	}`), 0644)

	// Target current
	currentTargetFile := filepath.Join(baseConfig, "current_target")
	_ = os.WriteFile(currentTargetFile, []byte("TestVault\n"), 0644)

	// Run hook with invocationNum = 1
	hookInputJSON := `{"conversationId":"conv-123","invocationNum":1,"targetVault":"TestVault"}`
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	_, _ = w.Write([]byte(hookInputJSON))
	_ = w.Close()

	oldStdin := os.Stdin
	defer func() { os.Stdin = oldStdin }()
	os.Stdin = r

	oldStdout := os.Stdout
	rOut, wOut, _ := os.Pipe()
	os.Stdout = wOut

	rootCmd.SetArgs([]string{"hook"})
	err = rootCmd.Execute()
	_ = wOut.Close()
	os.Stdout = oldStdout

	if err != nil {
		t.Fatalf("hook command failed: %v", err)
	}

	var hookOutput config.HookPayload
	_ = json.NewDecoder(rOut).Decode(&hookOutput)

	if len(hookOutput.InjectSteps) != 1 {
		t.Fatalf("expected 1 inject step, got %d", len(hookOutput.InjectSteps))
	}
	msg := hookOutput.InjectSteps[0].EphemeralMessage

	if !strings.Contains(msg, "[OBSITRACER: INICIO DE SESIÓN -> TestVault]") {
		t.Errorf("expected session start header, got:\n%s", msg)
	}
	if !strings.Contains(msg, "📍 Foco Inicial: Nota1.md (Línea 15, Columna 3)") {
		t.Errorf("expected initial focus line, got:\n%s", msg)
	}
	if !strings.Contains(msg, "⚡ Bloques /ia() Pendientes:") || !strings.Contains(msg, "Genera el resumen") {
		t.Errorf("expected pending IA block, got:\n%s", msg)
	}
	if strings.Contains(msg, "OldOffline1.md") || strings.Contains(msg, "Diferencial Estructural") {
		t.Errorf("expected offline backlog to be discarded, but found in message:\n%s", msg)
	}

	// Verify crud.json is now empty
	remainingChanges, _ := mailbox.DrainCRUDMailbox(crudFile)
	if len(remainingChanges) != 0 {
		t.Errorf("expected 0 remaining changes in crud.json, got %d", len(remainingChanges))
	}
}

func TestKittySessionRegistrationAndAutoBinding(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-cli-kitty-reg-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	origKittyID := os.Getenv("KITTY_WINDOW_ID")
	defer os.Setenv("KITTY_WINDOW_ID", origKittyID)
	os.Setenv("KITTY_WINDOW_ID", "77")

	vaultDir := filepath.Join(tempDir, "Documents", "TestVault")
	if err := os.MkdirAll(vaultDir, 0755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(vaultDir, "Nota.md"), []byte("# Nota"), 0644)

	baseConfig := filepath.Join(tempDir, ".config", "obsitracer")
	vaultMailbox := filepath.Join(baseConfig, "vaults", "TestVault")
	_ = os.MkdirAll(vaultMailbox, 0755)

	focusFile := filepath.Join(vaultMailbox, "focus.json")
	_ = os.WriteFile(focusFile, []byte(`{"vault":"TestVault","vaultPath":"`+vaultDir+`","focus":{"file":"Nota.md","line":1,"ch":0}}`), 0644)

	// Set Kitty window 77 target to TestVault
	_ = terminal.SetTarget("77", "TestVault")

	// Ensure session target does not exist yet
	convID := "agy-test-conv-77"
	if got := terminal.GetSessionTarget(convID); got != "" {
		t.Fatalf("expected empty session target initially, got %s", got)
	}

	// Run hook
	hookInputJSON := `{"conversationId":"` + convID + `","invocationNum":0}`
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	_, _ = w.Write([]byte(hookInputJSON))
	_ = w.Close()

	oldStdin := os.Stdin
	defer func() { os.Stdin = oldStdin }()
	os.Stdin = r

	oldStdout := os.Stdout
	rOut, wOut, _ := os.Pipe()
	os.Stdout = wOut

	resetFlags(rootCmd)
	rootCmd.SetArgs([]string{"hook"})
	err = rootCmd.Execute()
	_ = wOut.Close()
	os.Stdout = oldStdout

	if err != nil {
		t.Fatalf("hook execution failed: %v", err)
	}

	// 1. Verify kitty-77.session was created with convID
	if sess := terminal.GetKittyWindowSession("77"); sess != convID {
		t.Errorf("expected kitty-77.session to contain %q, got %q", convID, sess)
	}

	// 2. Verify session target was automatically bound to window's target
	if st := terminal.GetSessionTarget(convID); st != "TestVault" {
		t.Errorf("expected session target for %q to be TestVault, got %q", convID, st)
	}

	_ = rOut.Close()
}

func TestSelectorTuningBoundSession(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-cli-selector-tune-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	origKittyID := os.Getenv("KITTY_WINDOW_ID")
	defer os.Setenv("KITTY_WINDOW_ID", origKittyID)
	os.Setenv("KITTY_WINDOW_ID", "88")

	// Register sessions for windows 88 and 89
	conv1 := "agy-session-88"
	conv2 := "agy-session-89"
	_ = terminal.SetKittyWindowSession("88", conv1)
	_ = terminal.SetKittyWindowSession("89", conv2)

	// Simulate selector applying target to pane 88 and window 89
	selectPaneID = "88"
	selectTabID = "tab-1"
	selectWindowIDs = "89"
	applySelectTarget("AlphaVault")

	if got := terminal.GetSessionTarget(conv1); got != "AlphaVault" {
		t.Errorf("expected session %s target to be AlphaVault, got %q", conv1, got)
	}
	if got := terminal.GetSessionTarget(conv2); got != "AlphaVault" {
		t.Errorf("expected session %s target to be AlphaVault, got %q", conv2, got)
	}

	// Clear target
	clearSelectTarget()

	if got := terminal.GetSessionTarget(conv1); got != "" {
		t.Errorf("expected session %s target to be cleared, got %q", conv1, got)
	}
	if got := terminal.GetSessionTarget(conv2); got != "" {
		t.Errorf("expected session %s target to be cleared, got %q", conv2, got)
	}

	// Test target CLI command updating bound session
	resetFlags(rootCmd)
	b := bytes.NewBufferString("")
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"target", "--pane", "88", "BetaVault"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("target command failed: %v", err)
	}

	if got := terminal.GetSessionTarget(conv1); got != "BetaVault" {
		t.Errorf("expected session %s target to be BetaVault after target command, got %q", conv1, got)
	}

	// Test clear CLI command clearing bound session
	resetFlags(rootCmd)
	b.Reset()
	rootCmd.SetOut(b)
	rootCmd.SetArgs([]string{"clear", "--pane", "88"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("clear command failed: %v", err)
	}

	if got := terminal.GetSessionTarget(conv1); got != "" {
		t.Errorf("expected session %s target to be cleared after clear command, got %q", conv1, got)
	}
}

func TestHookSuccessiveTurns_InvocationNumZero(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "obsitracer-cli-hook-turns-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempDir)

	origKittyID := os.Getenv("KITTY_WINDOW_ID")
	defer os.Setenv("KITTY_WINDOW_ID", origKittyID)
	os.Setenv("KITTY_WINDOW_ID", "55")

	vaultDir := filepath.Join(tempDir, "Documents", "TestVault")
	_ = os.MkdirAll(vaultDir, 0755)
	_ = os.WriteFile(filepath.Join(vaultDir, "Nota.md"), []byte("# Contenido"), 0644)

	baseConfig := filepath.Join(tempDir, ".config", "obsitracer")
	vaultMailbox := filepath.Join(baseConfig, "vaults", "TestVault")
	_ = os.MkdirAll(vaultMailbox, 0755)

	focusFile := filepath.Join(vaultMailbox, "focus.json")
	_ = os.WriteFile(focusFile, []byte(`{"vault":"TestVault","vaultPath":"`+vaultDir+`","focus":{"file":"Nota.md","line":10,"ch":2}}`), 0644)

	_ = terminal.SetTarget("55", "TestVault")
	currentTargetFile := filepath.Join(baseConfig, "current_target")
	_ = os.WriteFile(currentTargetFile, []byte("TestVault\n"), 0644)

	executeHook := func(inputJSON string) config.HookPayload {
		r, w, _ := os.Pipe()
		_, _ = w.Write([]byte(inputJSON))
		_ = w.Close()

		oldStdin := os.Stdin
		defer func() { os.Stdin = oldStdin }()
		os.Stdin = r

		oldStdout := os.Stdout
		rOut, wOut, _ := os.Pipe()
		os.Stdout = wOut

		resetFlags(rootCmd)
		rootCmd.SetArgs([]string{"hook"})
		_ = rootCmd.Execute()
		_ = wOut.Close()
		os.Stdout = oldStdout

		var payload config.HookPayload
		_ = json.NewDecoder(rOut).Decode(&payload)
		return payload
	}

	// Turn 1: invocationNum is 0 (omitted by AGY), first time for conv-stable
	p1 := executeHook(`{"conversationId":"conv-stable","invocationNum":0}`)
	if len(p1.InjectSteps) != 1 || !strings.Contains(p1.InjectSteps[0].EphemeralMessage, "[OBSITRACER: INICIO DE SESIÓN -> TestVault]") {
		t.Fatalf("Turn 1 expected INICIO DE SESIÓN, got: %+v", p1)
	}

	// Turn 2: invocationNum is 0, same conversation ID, no changes
	p2 := executeHook(`{"conversationId":"conv-stable","invocationNum":0}`)
	if len(p2.InjectSteps) != 0 && p2.InjectSteps[0].EphemeralMessage != "" {
		t.Fatalf("Turn 2 expected silent payload (no new session, no deltas), got: %q", p2.InjectSteps[0].EphemeralMessage)
	}

	// Turn 3: invocationNum is 0, different conversation ID -> triggers new session
	p3 := executeHook(`{"conversationId":"conv-new","invocationNum":0}`)
	if len(p3.InjectSteps) != 1 || !strings.Contains(p3.InjectSteps[0].EphemeralMessage, "[OBSITRACER: INICIO DE SESIÓN -> TestVault]") {
		t.Fatalf("Turn 3 expected INICIO DE SESIÓN for new conversation ID, got: %+v", p3)
	}
}
