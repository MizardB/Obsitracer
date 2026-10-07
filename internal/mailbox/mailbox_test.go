package mailbox_test

import (
	"os"
	"path/filepath"
	"testing"

	"obsitracer/internal/mailbox"
)

func TestAtomicWriteAndRead(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obsitracer-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	target := filepath.Join(tmpDir, "state.json")
	data := map[string]int{"count": 42}

	if err := mailbox.AtomicWriteJSON(target, data); err != nil {
		t.Fatalf("atomic write failed: %v", err)
	}

	readBack, ok := mailbox.ReadJSONSafe[map[string]int](target)
	if !ok {
		t.Fatalf("read json failed")
	}
	if readBack["count"] != 42 {
		t.Errorf("expected count 42, got %d", readBack["count"])
	}
}

func TestDrainCRUDMailbox(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obsitracer-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	crudFile := filepath.Join(tmpDir, "crud.json")
	initial := map[string]any{
		"changes": []map[string]any{
			{"path": "note.md", "op": "modificado"},
		},
		"ia_blocks": []map[string]any{
			{"file": "note.md", "line": 2, "prompt": "resumir"},
		},
	}
	if err := mailbox.AtomicWriteJSON(crudFile, initial); err != nil {
		t.Fatalf("failed to seed crud.json: %v", err)
	}

	changes, iaBlocks := mailbox.DrainCRUDMailbox(crudFile)
	if len(changes) != 1 {
		t.Errorf("expected 1 change, got %d", len(changes))
	}
	if len(iaBlocks) != 1 {
		t.Errorf("expected 1 ia_block, got %d", len(iaBlocks))
	}

	// Segundo drain debe retornar vacío
	changes2, iaBlocks2 := mailbox.DrainCRUDMailbox(crudFile)
	if len(changes2) != 0 || len(iaBlocks2) != 0 {
		t.Errorf("expected drained mailbox to be empty")
	}
}

func TestDrainCRUDMailbox_WithDiff(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obsitracer-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	crudFile := filepath.Join(tmpDir, "crud.json")
	initial := map[string]any{
		"changes": []map[string]any{
			{
				"path": "Inbox/Prueba.md",
				"op":   "modified",
				"diff": []string{
					"+ nueva idea",
					"- vieja idea",
				},
			},
		},
	}
	if err := mailbox.AtomicWriteJSON(crudFile, initial); err != nil {
		t.Fatalf("failed to seed crud.json: %v", err)
	}

	changes, _ := mailbox.DrainCRUDMailbox(crudFile)
	if len(changes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(changes))
	}
	ch := changes[0]
	if ch.Path != "Inbox/Prueba.md" {
		t.Errorf("expected path 'Inbox/Prueba.md', got %s", ch.Path)
	}
	if ch.Op != "modified" {
		t.Errorf("expected op 'modified', got %s", ch.Op)
	}
	if len(ch.Diff) != 2 {
		t.Fatalf("expected 2 diff lines, got %d", len(ch.Diff))
	}
	if ch.Diff[0] != "+ nueva idea" || ch.Diff[1] != "- vieja idea" {
		t.Errorf("unexpected diff content: %v", ch.Diff)
	}
}

func TestResetCRUDMailbox(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obsitracer-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	crudFile := filepath.Join(tmpDir, "crud.json")
	initial := map[string]any{
		"ts":    "2026-10-07T10:00:00.000Z",
		"vault": "/test/vault/cortex",
		"changes": []map[string]any{
			{"path": "OldNote.md", "op": "created"},
			{"path": "OldNote2.md", "op": "modified"},
		},
		"ia_blocks": []map[string]any{
			{"file": "OldNote.md", "prompt": "old"},
		},
	}
	if err := mailbox.AtomicWriteJSON(crudFile, initial); err != nil {
		t.Fatalf("failed to seed crud.json: %v", err)
	}

	mailbox.ResetCRUDMailbox(crudFile, "/test/vault/cortex")

	type crudData struct {
		TS       string           `json:"ts"`
		Vault    string           `json:"vault"`
		Changes  []map[string]any `json:"changes"`
		IABlocks []map[string]any `json:"ia_blocks"`
	}
	data, ok := mailbox.ReadJSONSafe[crudData](crudFile)
	if !ok {
		t.Fatalf("failed to read reset crud.json")
	}
	if data.Vault != "/test/vault/cortex" {
		t.Errorf("expected vault '/test/vault/cortex', got '%s'", data.Vault)
	}
	if data.TS == "" {
		t.Errorf("expected non-empty timestamp")
	}
	if len(data.Changes) != 0 {
		t.Errorf("expected 0 changes, got %d", len(data.Changes))
	}
	if len(data.IABlocks) != 0 {
		t.Errorf("expected 0 ia_blocks, got %d", len(data.IABlocks))
	}
}
