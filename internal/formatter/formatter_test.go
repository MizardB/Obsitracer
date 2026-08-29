package formatter_test

import (
	"testing"

	"obsitracer/internal/formatter"
)

func TestBuildHookPayload(t *testing.T) {
	empty := formatter.BuildHookPayload("")
	if len(empty.InjectSteps) != 0 {
		t.Errorf("expected 0 inject steps for empty message")
	}

	withMsg := formatter.BuildHookPayload("Hello world")
	if len(withMsg.InjectSteps) != 1 {
		t.Fatalf("expected 1 inject step")
	}
	if withMsg.InjectSteps[0].EphemeralMessage != "Hello world" {
		t.Errorf("unexpected message: %s", withMsg.InjectSteps[0].EphemeralMessage)
	}
}
