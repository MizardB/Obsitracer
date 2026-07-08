# Obsitracer

Plugin de Obsidian + sistema de tracking cognitivo que alimenta a Antigravity con contexto en tiempo real sobre qué vault y nota tiene el usuario en foco.

## Componentes
- `obsitracer/` — Plugin de Obsidian: trackea cursor, foco y CRUD. Empuja el foco activo a tmux vía canal reactivo.
- `hook/` — Hook de Antigravity (PreInvocation): inyecta el contexto del vault activo como mensaje efímero al agente.
- `install.sh` / `Makefile` — Orquestador de instalación, build y vinculación de vaults.

## Instalación
```bash
# Menú interactivo
bash install.sh

# O directamente:
make install OBSIDIAN_VAULT="/ruta/a/tu/vault"
make install-hook
```

## tmux
El plugin empuja automáticamente el foco activo a tmux. Para verlo en tu statusline:
```bash
# En ~/.tmux.conf:
set -g status-right '#{@obsitracer}'
```
