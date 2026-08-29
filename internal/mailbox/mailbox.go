package mailbox

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"obsitracer/internal/config"
)

func AtomicWriteJSON(filePath string, v any) error {
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	tmpFile, err := os.CreateTemp(dir, "atomic-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmpFile.Name()

	enc := json.NewEncoder(tmpFile)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName)
		return err
	}

	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName)
		return err
	}

	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}

	return os.Rename(tmpName, filePath)
}

func ReadJSONSafe[T any](filePath string) (T, bool) {
	var result T
	data, err := os.ReadFile(filePath)
	if err != nil {
		return result, false
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return result, false
	}
	return result, true
}

type focusJSON struct {
	VaultPath string           `json:"vaultPath"`
	Focus     config.FocusInfo `json:"focus"`
}

func GetVaultFocus(vaultDir string) (string, config.FocusInfo) {
	focusFile := filepath.Join(vaultDir, "focus.json")
	data, ok := ReadJSONSafe[focusJSON](focusFile)
	if !ok {
		return "", config.FocusInfo{}
	}

	if data.VaultPath == "" {
		return "", config.FocusInfo{}
	}

	st, err := os.Stat(data.VaultPath)
	if err != nil || !st.IsDir() {
		return "", config.FocusInfo{}
	}

	return data.VaultPath, data.Focus
}

type crudJSON struct {
	Changes  []map[string]any `json:"changes"`
	IABlocks []map[string]any `json:"ia_blocks"`
}

func DrainCRUDMailbox(crudFile string) ([]map[string]any, []map[string]any) {
	data, ok := ReadJSONSafe[crudJSON](crudFile)
	if !ok {
		return nil, nil
	}

	changes := data.Changes
	iaBlocks := data.IABlocks

	if len(changes) > 0 || len(iaBlocks) > 0 {
		_ = AtomicWriteJSON(crudFile, crudJSON{
			Changes:  []map[string]any{},
			IABlocks: []map[string]any{},
		})
	}

	return changes, iaBlocks
}

type manifestJSON struct {
	TS   float64                    `json:"ts"`
	Tree map[string]config.FileMeta `json:"tree"`
}

func LoadManifest(manifestFile string) (map[string]config.FileMeta, bool) {
	if _, err := os.Stat(manifestFile); os.IsNotExist(err) {
		return make(map[string]config.FileMeta), true
	}
	data, ok := ReadJSONSafe[manifestJSON](manifestFile)
	if !ok || data.Tree == nil {
		return make(map[string]config.FileMeta), false
	}
	return data.Tree, false
}

func SaveManifest(manifestFile string, tree map[string]config.FileMeta) {
	_ = AtomicWriteJSON(manifestFile, manifestJSON{
		TS:   float64(time.Now().Unix()),
		Tree: tree,
	})
}

type sessionJSON struct {
	ConversationID string  `json:"conversationId"`
	LastTS         float64 `json:"last_ts"`
	LastFocus      string  `json:"last_focus"`
}

func LoadSessionState(sessionFile string) (sessionJSON, bool) {
	return ReadJSONSafe[sessionJSON](sessionFile)
}

func SaveSessionState(sessionFile, conversationID, lastFocusSig string) {
	_ = AtomicWriteJSON(sessionFile, sessionJSON{
		ConversationID: conversationID,
		LastTS:         float64(time.Now().Unix()),
		LastFocus:      lastFocusSig,
	})
}
