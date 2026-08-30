{
  description = "Obsitracer development and build environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSupportedSystem = f: nixpkgs.lib.genAttrs supportedSystems (system: f {
        pkgs = import nixpkgs { inherit system; };
      });
    in
    {
      apps = forEachSupportedSystem ({ pkgs }: {
        default = {
          type = "app";
          program = "${pkgs.writeShellScriptBin "obsitracer-setup" ''
            set -eo pipefail
            export PATH="${pkgs.lib.makeBinPath [ pkgs.bash pkgs.nodejs pkgs.esbuild pkgs.jq pkgs.fzf pkgs.tmux pkgs.go ]}:$HOME/.local/bin:$PATH"

            REPO_DIR="$(pwd)"
            mkdir -p "$REPO_DIR/bin" "$REPO_DIR/plugins/obsitracer/bin" "$HOME/.local/bin"

            echo "📦 Compilando CLI unificado de Obsitracer en Go..."
            (cd "$REPO_DIR" && go build -ldflags="-s -w" -o bin/obsitracer ./cmd/obsitracer)
            cp "$REPO_DIR/bin/obsitracer" "$REPO_DIR/plugins/obsitracer/bin/obsitracer"
            chmod +x "$REPO_DIR/bin/obsitracer" "$REPO_DIR/plugins/obsitracer/bin/obsitracer"

            echo "🔗 Creando enlace simbólico en ~/.local/bin/obsitracer..."
            ln -sf "$REPO_DIR/bin/obsitracer" "$HOME/.local/bin/obsitracer"

            exec "$REPO_DIR/bin/obsitracer" install "$@"
          ''}/bin/obsitracer-setup";
        };
      });

      devShells = forEachSupportedSystem ({ pkgs }: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs
            esbuild
            jq
            fzf
            tmux
            go
          ];

          shellHook = ''
            echo "🌿 [Obsitracer Nix Flake DevShell Activo]"
          '';
        };
      });
    };
}
