OBSIDIAN_VAULT ?=

.PHONY: build install install-hook

build:
	@echo "Construyendo memoria-tracker..."
	@cd memoria-tracker && npm install && npm run build

install: build
	@if [ -z "$(OBSIDIAN_VAULT)" ]; then \
		read -p "Introduce la ruta absoluta de tu Vault de Obsidian: " VAULT_PATH; \
		if [ -z "$$VAULT_PATH" ]; then echo "Error: La ruta no puede estar vacía"; exit 1; fi; \
	else \
		VAULT_PATH="$(OBSIDIAN_VAULT)"; \
	fi; \
	PLUGIN_DIR="$$VAULT_PATH/.obsidian/plugins/memoria-tracker"; \
	if [ ! -d "$$VAULT_PATH/.obsidian/plugins" ]; then \
		echo "Error: No se encontró .obsidian/plugins en $$VAULT_PATH. ¿Estás seguro que es un Vault válido?"; \
		exit 1; \
	fi; \
	echo "Instalando symlink en $$PLUGIN_DIR..."; \
	rm -rf "$$PLUGIN_DIR"; \
	ln -s "$(CURDIR)/memoria-tracker" "$$PLUGIN_DIR"; \
	echo "✅ Plugin de Memoria-OS vinculado exitosamente."

install-hook:
	@echo "Configurando el hook de Memoria-OS en Antigravity..."
	@mkdir -p ~/.gemini/config
	@if [ ! -f ~/.gemini/config/hooks.json ]; then echo '{}' > ~/.gemini/config/hooks.json; fi
	@jq '.["inject-vault-diff"] = {"PreInvocation": [{"type": "command", "command": "bash $(CURDIR)/hook/inject_vault_diff.sh"}]}' ~/.gemini/config/hooks.json > ~/.gemini/config/hooks_tmp.json
	@mv ~/.gemini/config/hooks_tmp.json ~/.gemini/config/hooks.json
	@echo "✅ Hook instalado. Antigravity ahora usará el script en $(CURDIR)/hook/inject_vault_diff.sh"
