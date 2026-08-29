OBSIDIAN_VAULT ?=

.PHONY: build install install-hook-agy uninstall install-tmux

build:
	@echo "Construyendo Obsitracer..."
	@cd obsitracer && esbuild main.ts --bundle --platform=node --external:obsidian --external:electron --format=cjs --target=es2018 --outfile=main.js

install: build
	@if [ -z "$(OBSIDIAN_VAULT)" ]; then \
		read -p "Introduce la ruta absoluta de tu Vault de Obsidian: " VAULT_PATH; \
		if [ -z "$$VAULT_PATH" ]; then echo "Error: La ruta no puede estar vacía"; exit 1; fi; \
	else \
		VAULT_PATH="$(OBSIDIAN_VAULT)"; \
	fi; \
	PLUGIN_DIR="$$VAULT_PATH/.obsidian/plugins/obsitracer"; \
	if [ ! -d "$$VAULT_PATH/.obsidian/plugins" ]; then \
		echo "Error: No se encontró .obsidian/plugins en $$VAULT_PATH. ¿Estás seguro que es un Vault válido?"; \
		exit 1; \
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

.PHONY: build build-engine install install-hook-agy uninstall install-tmux test

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
	@mkdir -p ~/.tmux/scripts
	@echo "Enlazando script del widget a ~/.tmux/scripts/obsitracer.sh..."
	@ln -sf "$(CURDIR)/tmux/obsitracer_widget.sh" ~/.tmux/scripts/obsitracer.sh
	@chmod +x ~/.tmux/scripts/obsitracer.sh
	@echo "✅ Widget de tmux instalado limpiamente (sin mutar tus dotfiles)."

install-hook-agy: build-engine
	@echo "Instalando plugin oficial de Obsitracer en Antigravity..."
	@mkdir -p ~/.gemini/config/plugins
	@rm -rf ~/.gemini/config/plugins/obsitracer
	@ln -sfn "$(CURDIR)/plugins/obsitracer" ~/.gemini/config/plugins/obsitracer
	@mkdir -p ~/.gemini/antigravity-cli/plugins
	@rm -rf ~/.gemini/antigravity-cli/plugins/obsitracer
	@ln -sfn "$(CURDIR)/plugins/obsitracer" ~/.gemini/antigravity-cli/plugins/obsitracer
	@echo "✅ Plugin autocontenido instalado en ~/.gemini/config/plugins/obsitracer."
	@$(MAKE) install-tmux
