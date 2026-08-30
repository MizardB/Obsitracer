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
          program = "${pkgs.writeShellScriptBin "obsitracer-installer" ''
            export PATH="${pkgs.lib.makeBinPath [ pkgs.bash pkgs.gnumake pkgs.nodejs pkgs.esbuild pkgs.jq pkgs.fzf pkgs.tmux pkgs.go ]}:$PATH"
            exec ${pkgs.bash}/bin/bash ./install.sh "$@"
          ''}/bin/obsitracer-installer";
        };
      });

      devShells = forEachSupportedSystem ({ pkgs }: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs
            gnumake
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
