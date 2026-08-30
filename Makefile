OBSIDIAN_VAULT ?=

.PHONY: build build-engine install install-hook-agy uninstall install-tmux test

build:
	@echo "Construyendo Obsitracer (Plugin Obsidian)..."
	@cd obsitracer && esbuild main.ts --bundle --platform=node --external:obsidian --external:electron --format=cjs --target=es2018 --outfile=main.js

build-engine:
	@echo "Compilando motor de alto rendimiento en Go (obsitracer-hook)..."
	@mkdir -p plugins/obsitracer/bin
	@go build -ldflags="-s -w" -o plugins/obsitracer/bin/obsitracer-hook ./cmd/obsitracer-hook
	@chmod +x plugins/obsitracer/bin/obsitracer-hook
	@echo "✅ Binario Go compilado en plugins/obsitracer/bin/obsitracer-hook"

test:
	@echo "Ejecutando suite de tests unitarios en Go..."
	@go test -v ./...

install-tmux:
	@echo "Instalando plugin autónomo de Tmux en ~/.tmux/plugins/obsitracer..."
	@mkdir -p ~/.tmux/plugins/obsitracer/scripts
	@ln -sf "$(CURDIR)/tmux/obsitracer.tmux" ~/.tmux/plugins/obsitracer/obsitracer.tmux
	@ln -sf "$(CURDIR)/tmux/scripts/obsitracer.sh" ~/.tmux/plugins/obsitracer/scripts/obsitracer.sh
	@ln -sf "$(CURDIR)/tmux/scripts/obsitracer-select.sh" ~/.tmux/plugins/obsitracer/scripts/obsitracer-select.sh
	@chmod +x ~/.tmux/plugins/obsitracer/obsitracer.tmux ~/.tmux/plugins/obsitracer/scripts/*.sh
	@if [ -n "$$TMUX" ]; then tmux run-shell ~/.tmux/plugins/obsitracer/obsitracer.tmux 2>/dev/null || true; fi
	@echo "✅ Plugin de Tmux instalado y cargado en ~/.tmux/plugins/obsitracer."

install-hook-agy: build-engine
	@echo "Instalando plugin oficial de Obsitracer en Antigravity..."
	@mkdir -p ~/.gemini/config/plugins
	@rm -rf ~/.gemini/config/plugins/obsitracer
	@ln -sfn "$(CURDIR)/plugins/obsitracer" ~/.gemini/config/plugins/obsitracer
	@mkdir -p ~/.gemini/antigravity-cli/plugins
	@rm -rf ~/.gemini/antigravity-cli/plugins/obsitracer
	@ln -sfn "$(CURDIR)/plugins/obsitracer" ~/.gemini/antigravity-cli/plugins/obsitracer
	@echo "✅ Plugin autocontenido instalado en ~/.gemini/antigravity-cli/plugins/obsitracer."
	@$(MAKE) install-tmux

install: build
	@if [ -z "$(OBSIDIAN_VAULT)" ]; then \
		read -p "Introduce la ruta absoluta de tu Vault de Obsidian: " VAULT_PATH; \
		if [ -z "$$VAULT_PATH" ]; then echo "Error: La ruta no puede estar vacía"; exit 1; fi; \
	else \
		VAULT_PATH="$(OBSIDIAN_VAULT)"; \
	fi; \
	PLUGIN_DIR="$$VAULT_PATH/.obsidian/plugins/obsitracer"; \
	if [ ! -d "$$VAULT_PATH/.obsidian/plugins" ]; then \
		mkdir -p "$$VAULT_PATH/.obsidian/plugins"; \
	fi; \
	echo "Instalando symlink en $$PLUGIN_DIR..."; \
	rm -rf "$$PLUGIN_DIR"; \
	ln -s "$(CURDIR)/obsitracer" "$$PLUGIN_DIR"; \
	echo "✅ Obsitracer vinculado exitosamente en el Vault."

uninstall:
	@if [ -z "$(OBSIDIAN_VAULT)" ]; then \
		read -p "Introduce la ruta absoluta de tu Vault de Obsidian: " VAULT_PATH; \
		if [ -z "$$VAULT_PATH" ]; then echo "Error: La ruta no puede estar vacía"; exit 1; fi; \
	else \
		VAULT_PATH="$(OBSIDIAN_VAULT)"; \
	fi; \
	PLUGIN_DIR="$$VAULT_PATH/.obsidian/plugins/obsitracer"; \
	if [ -L "$$PLUGIN_DIR" ] || [ -d "$$PLUGIN_DIR" ]; then \
		rm -rf "$$PLUGIN_DIR"; \
		echo "🗑️  Symlink del plugin eliminado de $$VAULT_PATH"; \
	fi
