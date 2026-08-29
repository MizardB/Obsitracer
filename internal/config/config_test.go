package config_test

import (
	"testing"

	"obsitracer/internal/config"
)

func TestFocusInfo(t *testing.T) {
	empty := config.FocusInfo{}
	if empty.IsValid() {
		t.Errorf("expected empty focus to be invalid")
	}
	if sig := empty.ToSignature(); sig != "" {
		t.Errorf("expected empty signature, got %s", sig)
	}

	valid := config.FocusInfo{File: "Notes/Plan.md", Line: 10, Ch: 5}
	if !valid.IsValid() {
		t.Errorf("expected valid focus")
	}
	if sig := valid.ToSignature(); sig != "Notes/Plan.md:10:5" {
		t.Errorf("expected 'Notes/Plan.md:10:5', got %s", sig)
	}
}

func TestStructuralDiff(t *testing.T) {
	empty := config.StructuralDiff{}
	if empty.HasChanges() {
		t.Errorf("expected empty diff to have no changes")
	}
	if count := empty.TotalCount(); count != 0 {
		t.Errorf("expected 0 total count, got %d", count)
	}

	withChanges := config.StructuralDiff{
		Created:  []string{"A.md"},
		Modified: []string{"B.md"},
	}
	if !withChanges.HasChanges() {
		t.Errorf("expected withChanges to have changes")
	}
	if count := withChanges.TotalCount(); count != 2 {
		t.Errorf("expected count 2, got %d", count)
	}
}
