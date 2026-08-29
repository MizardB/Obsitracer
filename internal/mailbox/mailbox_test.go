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
