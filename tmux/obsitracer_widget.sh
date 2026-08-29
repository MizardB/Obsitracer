#!/usr/bin/env bash
PANE_CMD=$(tmux display-message -p -F "#{pane_current_command}" 2>/dev/null)
if [[ "$PANE_CMD" != *"agy"* ]]; then
    echo -n ""
    exit 0
fi

TARGET_VAULT=$(tmux display-message -p -F "#{@obsitracer_target}" 2>/dev/null)

if [ -z "$TARGET_VAULT" ]; then
    PANE_PATH=$(tmux display-message -p -F "#{pane_current_path}" 2>/dev/null)
    VAULTS_FILE="$HOME/.config/obsitracer/vaults.json"
    if [ -n "$PANE_PATH" ] && [ -f "$VAULTS_FILE" ]; then
        # Pure bash parsing of simple JSON (very fast, no jq)
        while read -r line; do
            if [[ "$line" =~ \"name\":\ *\"([^\"]+)\" ]]; then
                current_name="${BASH_REMATCH[1]}"
            elif [[ "$line" =~ \"path\":\ *\"([^\"]+)\" ]]; then
                current_path="${BASH_REMATCH[1]}"
                if [[ "$PANE_PATH" == "$current_path"* ]]; then
                    TARGET_VAULT="$current_name"
                    break
                fi
            fi
        done < "$VAULTS_FILE"
    fi
fi

if [ -n "$TARGET_VAULT" ]; then
    FOCUS_FILE="$HOME/.config/obsitracer/vaults/$TARGET_VAULT/focus.json"
    if [ -f "$FOCUS_FILE" ]; then
        # Parse focus.file using grep/sed
        FILE_FOCUS=$(grep '"file":' "$FOCUS_FILE" | head -n 1 | sed -E 's/.*"file": *"([^"]+)".*/\1/')
        if [ -n "$FILE_FOCUS" ]; then
            echo "👓 $TARGET_VAULT/$(basename "$FILE_FOCUS")"
            exit 0
        fi
    fi
    echo "👓 $TARGET_VAULT"
    exit 0
fi

echo -n ""
