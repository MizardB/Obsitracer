OBSIDIAN_VAULT ?=

.PHONY: build install install-hook uninstall

build:
	@echo "Construyendo Obsitracer..."
	@cd obsitracer && npm install && npm run build

install: build
	@if [ -z "$(OBSIDIAN_VAULT)" ]; then \
		read -p "Introduce la ruta absoluta de tu Vault de Obsidian: " VAULT_PATH; \
		if [ -z "$$VAULT_PATH" ]; then echo "Error: La ruta no puede estar vacía"; exit 1; fi; \
	else \
		VAULT_PATH="$(OBSIDIAN_VAULT)"; \
	fi; \
	PLUGIN_DIR="$$VAULT_PATH/.obsidian/plugins/obsitracer"; \
	LEGACY_DIR="$$VAULT_PATH/.obsidian/plugins/memoria-tracker"; \
	if [ ! -d "$$VAULT_PATH/.obsidian/plugins" ]; then \
		echo "Error: No se encontró .obsidian/plugins en $$VAULT_PATH. ¿Estás seguro que es un Vault válido?"; \
		exit 1; \
	fi; \
	echo "Instalando symlink en $$PLUGIN_DIR..."; \
	rm -rf "$$PLUGIN_DIR"; \
	rm -rf "$$LEGACY_DIR"; \
	ln -s "$(CURDIR)/obsitracer" "$$PLUGIN_DIR"; \
	echo "✅ Obsitracer vinculado exitosamente."

uninstall:
	@if [ -z "$(OBSIDIAN_VAULT)" ]; then \
		read -p "Introduce la ruta absoluta de tu Vault de Obsidian: " VAULT_PATH; \
		if [ -z "$$VAULT_PATH" ]; then echo "Error: La ruta no puede estar vacía"; exit 1; fi; \
	else \
		VAULT_PATH="$(OBSIDIAN_VAULT)"; \
	fi; \
	PLUGIN_DIR="$$VAULT_PATH/.obsidian/plugins/obsitracer"; \
	LEGACY_DIR="$$VAULT_PATH/.obsidian/plugins/memoria-tracker"; \
	if [ -L "$$PLUGIN_DIR" ] || [ -d "$$PLUGIN_DIR" ]; then \
		rm -rf "$$PLUGIN_DIR"; \
		echo "🗑️  Symlink del plugin eliminado de $$VAULT_PATH"; \
	else \
		echo "⚠️  No se encontró el plugin en $$VAULT_PATH"; \
	fi; \
	if [ -L "$$LEGACY_DIR" ] || [ -d "$$LEGACY_DIR" ]; then \
		rm -rf "$$LEGACY_DIR"; \
		echo "🗑️  Symlink legacy (memoria-tracker) eliminado."; \
	fi; \
	VAULT_NAME=$$(basename "$$VAULT_PATH"); \
	BUZON_FILE=~/.config/obsitracer/vaults/$$VAULT_NAME.json; \
	if [ -f "$$BUZON_FILE" ]; then \
		rm -f "$$BUZON_FILE"; \
		echo "🧹 Buzón residual $$VAULT_NAME.json eliminado."; \
	fi; \
	echo "✅ Desinstalación completa en el Vault $$VAULT_NAME."

install-hook:
	@echo "Configurando el hook de Obsitracer en Antigravity..."
	@mkdir -p ~/.gemini/config
	@if [ ! -f ~/.gemini/config/hooks.json ]; then echo '{}' > ~/.gemini/config/hooks.json; fi
	@jq '."inject-vault-diff" = {"PreInvocation": [{"type": "command", "command": "bash $(CURDIR)/hook/inject_vault_diff.sh"}]}' ~/.gemini/config/hooks.json > ~/.gemini/config/hooks_tmp.json
	@mv ~/.gemini/config/hooks_tmp.json ~/.gemini/config/hooks.json
	@echo "✅ Hook instalado. Antigravity ahora usará el script en $(CURDIR)/hook/inject_vault_diff.sh"
