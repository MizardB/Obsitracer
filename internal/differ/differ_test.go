package differ_test

import (
	"testing"

	"obsitracer/internal/config"
	"obsitracer/internal/differ"
)

func TestFirstRun(t *testing.T) {
	current := map[string]config.FileMeta{
		"Note.md": {Mtime: 100, Size: 50},
	}
	diff := differ.CalculateStructuralDiff(current, nil, true)
	if diff.HasChanges() {
		t.Errorf("expected no changes on first run")
	}
}

func TestCreatedAndModified(t *testing.T) {
	prev := map[string]config.FileMeta{
		"Old.md": {Mtime: 100, Size: 50},
	}
	current := map[string]config.FileMeta{
		"Old.md":            {Mtime: 200, Size: 60}, // Modified
		"New.md":            {Mtime: 150, Size: 20}, // Created
		".trash/Trashed.md": {Mtime: 120, Size: 30}, // Trashed
	}
	diff := differ.CalculateStructuralDiff(current, prev, false)

	if len(diff.Created) != 1 || diff.Created[0] != "New.md" {
		t.Errorf("expected 1 created file (New.md), got %v", diff.Created)
	}
	if len(diff.Modified) != 1 || diff.Modified[0] != "Old.md" {
		t.Errorf("expected 1 modified file (Old.md), got %v", diff.Modified)
	}
	if len(diff.Trashed) != 1 || diff.Trashed[0] != ".trash/Trashed.md" {
		t.Errorf("expected 1 trashed file, got %v", diff.Trashed)
	}
	if len(diff.Deleted) != 0 {
		t.Errorf("expected 0 deleted, got %v", diff.Deleted)
	}
}

func TestDeletedAndPurged(t *testing.T) {
	prev := map[string]config.FileMeta{
		"Existing.md":        {Mtime: 100, Size: 50},
		".trash/OldTrash.md": {Mtime: 90, Size: 10},
	}
	current := map[string]config.FileMeta{}
	diff := differ.CalculateStructuralDiff(current, prev, false)

	if len(diff.Deleted) != 1 || diff.Deleted[0] != "Existing.md" {
		t.Errorf("expected 1 deleted file, got %v", diff.Deleted)
	}
	if len(diff.Purged) != 1 || diff.Purged[0] != ".trash/OldTrash.md" {
		t.Errorf("expected 1 purged file, got %v", diff.Purged)
	}
}
