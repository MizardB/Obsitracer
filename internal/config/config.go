package config

import (
	"fmt"
	"os"
	"path/filepath"
)

const (
	SessionTimeoutSeconds int64 = 1800
	MaxItemsDisplay             = 8
)

var IgnoredDirs = map[string]bool{
	".obsidian":    true,
	".git":         true,
	".helixnotes":  true,
	"graphify-out": true,
	"node_modules": true,
}

var SupportedExtensions = []string{".md", ".canvas"}

func GetBaseConfigDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join("/home", os.Getenv("USER"), ".config", "obsitracer")
	}
	return filepath.Join(home, ".config", "obsitracer")
}

type FocusInfo struct {
	File string `json:"file"`
	Line int    `json:"line"`
	Ch   int    `json:"ch"`
}

func (f FocusInfo) IsValid() bool {
	return f.File != ""
}

func (f FocusInfo) ToSignature() string {
	if !f.IsValid() {
		return ""
	}
	line := f.Line
	if line <= 0 {
		line = 1
	}
	return fmt.Sprintf("%s:%d:%d", f.File, line, f.Ch)
}

type FileMeta struct {
	Mtime int64 `json:"mtime"`
	Size  int64 `json:"size"`
}

type StructuralDiff struct {
	Created  []string
	Modified []string
	Trashed  []string
	Deleted  []string
	Purged   []string
}

func (d StructuralDiff) HasChanges() bool {
	return len(d.Created) > 0 ||
		len(d.Modified) > 0 ||
		len(d.Trashed) > 0 ||
		len(d.Deleted) > 0 ||
		len(d.Purged) > 0
}

func (d StructuralDiff) TotalCount() int {
	return len(d.Created) +
		len(d.Modified) +
		len(d.Trashed) +
		len(d.Deleted) +
		len(d.Purged)
}

type HookInput struct {
	ConversationID string `json:"conversationId"`
	InvocationNum  int    `json:"invocationNum"`
}

type InjectStep struct {
	EphemeralMessage string `json:"ephemeralMessage,omitempty"`
}

type HookPayload struct {
	InjectSteps []InjectStep `json:"injectSteps"`
}
