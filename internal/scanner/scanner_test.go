package scanner_test

import (
	"testing"

	"obsitracer/internal/scanner"
)

func TestIsDirIgnored(t *testing.T) {
	if !scanner.IsDirIgnored(".git") {
		t.Errorf("expected .git to be ignored")
	}
	if !scanner.IsDirIgnored(".obsidian") {
		t.Errorf("expected .obsidian to be ignored")
	}
	if !scanner.IsDirIgnored("graphify-out") {
		t.Errorf("expected graphify-out to be ignored")
	}
	if !scanner.IsDirIgnored(".hidden_dir") {
		t.Errorf("expected .hidden_dir to be ignored")
	}
	if scanner.IsDirIgnored(".trash") {
		t.Errorf("expected .trash NOT to be ignored")
	}
	if scanner.IsDirIgnored("Notes") {
		t.Errorf("expected Notes NOT to be ignored")
	}
}
