package differ

import (
	"strings"

	"obsitracer/internal/config"
)

func CalculateStructuralDiff(
	current map[string]config.FileMeta,
	prev map[string]config.FileMeta,
	isFirstRun bool,
) config.StructuralDiff {
	diff := config.StructuralDiff{}

	if isFirstRun {
		return diff
	}

	// 1. Detectar creados, modificados y traslados a papelera
	for path, meta := range current {
		prevMeta, exists := prev[path]
		if !exists {
			if strings.HasPrefix(path, ".trash/") {
				diff.Trashed = append(diff.Trashed, path)
			} else {
				diff.Created = append(diff.Created, path)
			}
		} else {
			if meta.Mtime != prevMeta.Mtime || meta.Size != prevMeta.Size {
				diff.Modified = append(diff.Modified, path)
			}
		}
	}

	// 2. Detectar eliminados permanentes y purgas de papelera
	for path := range prev {
		if _, exists := current[path]; !exists {
			if strings.HasPrefix(path, ".trash/") {
				diff.Purged = append(diff.Purged, path)
			} else {
				diff.Deleted = append(diff.Deleted, path)
			}
		}
	}

	return diff
}
