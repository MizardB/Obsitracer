package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"time"

	"obsitracer/internal/config"
	"obsitracer/internal/differ"
	"obsitracer/internal/formatter"
	"obsitracer/internal/mailbox"
	"obsitracer/internal/scanner"
	"obsitracer/internal/tmux"
)

func parseHookStdin() config.HookInput {
	var input config.HookInput
	stat, err := os.Stdin.Stat()
	if err != nil || (stat.Mode()&os.ModeCharDevice) != 0 {
		return input
	}

	raw, err := io.ReadAll(os.Stdin)
	if err != nil || len(raw) == 0 {
		return input
	}

	_ = json.Unmarshal(raw, &input)
	return input
}

func outputPayload(message string) {
	payload := formatter.BuildHookPayload(message)
	_ = json.NewEncoder(os.Stdout).Encode(payload)
}

func main() {
	hookInput := parseHookStdin()
	conversationID := hookInput.ConversationID
	invocationNum := hookInput.InvocationNum

	targetVault := tmux.GetTmuxTarget("")
	if targetVault == "" {
		outputPayload("")
		return
	}

	vaultDir := filepath.Join(config.GetBaseConfigDir(), "vaults", targetVault)
	if st, err := os.Stat(vaultDir); err != nil || !st.IsDir() {
		outputPayload("")
		return
	}

	vaultPath, focusInfo := mailbox.GetVaultFocus(vaultDir)
	if vaultPath == "" {
		outputPayload("")
		return
	}

	manifestFile := filepath.Join(vaultDir, "manifest.json")
	crudFile := filepath.Join(vaultDir, "crud.json")
	sessionFile := filepath.Join(vaultDir, "session_state.json")

	sessionData, hasSession := mailbox.LoadSessionState(sessionFile)
	lastConvID := sessionData.ConversationID
	lastTS := int64(sessionData.LastTS)
	lastFocusSig := sessionData.LastFocus
	currentFocusSig := focusInfo.ToSignature()

	now := time.Now().Unix()
	isNewSession := (conversationID != "" && conversationID != lastConvID) ||
		invocationNum == 1 ||
		!hasSession ||
		(now-lastTS > config.SessionTimeoutSeconds)

	if isNewSession {
		// Modo Inter-Sesión: Escaneo de árbol y diff estructural
		currentTree := scanner.ScanDirtree(vaultPath)
		prevTree, isFirstRun := mailbox.LoadManifest(manifestFile)
		diff := differ.CalculateStructuralDiff(currentTree, prevTree, isFirstRun)
		_, iaBlocks := mailbox.DrainCRUDMailbox(crudFile)

		mailbox.SaveManifest(manifestFile, currentTree)
		mailbox.SaveSessionState(sessionFile, conversationID, currentFocusSig)

		msg := formatter.FormatSessionStart(targetVault, focusInfo, diff, iaBlocks)
		outputPayload(msg)
		return
	}

	// Modo Intra-Sesión: Micro-deltas en caliente
	changes, iaBlocks := mailbox.DrainCRUDMailbox(crudFile)
	hasFocusChanged := (currentFocusSig != lastFocusSig) && (currentFocusSig != "")
	hasLiveChanges := len(changes) > 0
	hasIA := len(iaBlocks) > 0

	if !hasFocusChanged && !hasLiveChanges && !hasIA {
		mailbox.SaveSessionState(sessionFile, conversationID, lastFocusSig)
		outputPayload("")
		return
	}

	mailbox.SaveSessionState(sessionFile, conversationID, currentFocusSig)
	var focusToReport *config.FocusInfo
	if hasFocusChanged {
		focusToReport = &focusInfo
	}

	msg := formatter.FormatLiveDelta(targetVault, focusToReport, changes, iaBlocks)
	outputPayload(msg)
}
