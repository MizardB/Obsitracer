#!/usr/bin/env bash

# Colores
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function menu() {
    clear
    echo -e "${CYAN}[=== OBSITRACER ORCHESTRATOR ===]${NC}"
    echo "1) 🌐 Instalar en Agente (Hook & Skill)"
    echo "2) 🔗 Vincular Plugin a un Vault"
    echo "3) 🗑️  Desvincular Plugin de un Vault (Limpiar)"
    echo "4) 🔨 Re-compilar Plugin (Build)"
    echo "5) ❌ Salir"
    echo ""
    read -p "Elige una opción (1-5): " opcion
    
    case $opcion in
        1)
            echo -e "\n${GREEN}Instalando Plugin de Obsitracer en Antigravity & Widget de tmux...${NC}"
            make install-hook-agy
            read -p "Presiona ENTER para continuar..."
            menu
            ;;
        2)
            echo -e "\n${CYAN}--- Vincular Vault ---${NC}"
            read -p "Introduce la ruta absoluta de tu Vault de Obsidian: " vault_path
            if [ -n "$vault_path" ]; then
                make install OBSIDIAN_VAULT="$vault_path"
            else
                echo -e "${RED}Ruta vacía. Abortando.${NC}"
            fi
            read -p "Presiona ENTER para continuar..."
            menu
            ;;
        3)
            echo -e "\n${CYAN}--- Desvincular Vault ---${NC}"
            read -p "Introduce la ruta absoluta del Vault a limpiar: " vault_path
            if [ -n "$vault_path" ]; then
                make uninstall OBSIDIAN_VAULT="$vault_path"
            else
                echo -e "${RED}Ruta vacía. Abortando.${NC}"
            fi
            read -p "Presiona ENTER para continuar..."
            menu
            ;;
        4)
            echo -e "\n${GREEN}Ejecutando: make build && make build-engine${NC}"
            make build
            make build-engine
            read -p "Presiona ENTER para continuar..."
            menu
            ;;
        5)
            echo -e "${GREEN}¡Nos vemos! Obsitracer sigue corriendo.${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Opción inválida.${NC}"
            sleep 1
            menu
            ;;
    esac
}

menu
