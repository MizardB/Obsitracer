package scanner

import (
	"io/fs"
	"path/filepath"
	"strings"

	"obsitracer/internal/config"
)

func IsDirIgnored(dirname string) bool {
	if config.IgnoredDirs[dirname] {
		return true
	}
	if strings.HasPrefix(dirname, ".") && dirname != ".trash" {
		return true
	}
	return false
}

func hasSupportedExtension(name string) bool {
	for _, ext := range config.SupportedExtensions {
		if strings.HasSuffix(name, ext) {
			return true
		}
	}
	return false
}

func ScanDirtree(vaultPath string) map[string]config.FileMeta {
	tree := make(map[string]config.FileMeta)

	_ = filepath.WalkDir(vaultPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if d.IsDir() {
			name := d.Name()
			if path != vaultPath && IsDirIgnored(name) {
				return filepath.SkipDir
			}
			return nil
		}

		name := d.Name()
		if hasSupportedExtension(name) {
			rel, err := filepath.Rel(vaultPath, path)
			if err != nil {
				return nil
			}

			// Validar que ningún segmento intermedio esté ignorado
			parts := strings.Split(filepath.Dir(rel), string(filepath.Separator))
			for _, p := range parts {
				if p != "." && IsDirIgnored(p) {
					return nil
				}
			}

			info, err := d.Info()
			if err == nil {
				tree[rel] = config.FileMeta{
					Mtime: info.ModTime().Unix(),
					Size:  info.Size(),
				}
			}
		}
		return nil
	})

	return tree
}
