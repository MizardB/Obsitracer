OBSIDIAN_VAULT ?=

.PHONY: build install

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
