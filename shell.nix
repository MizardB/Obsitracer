{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    nodejs
    gnumake
    esbuild
    jq
  ];

  shellHook = ''
    export ESBUILD_BINARY_PATH="${pkgs.esbuild}/bin/esbuild"
    echo "🌿 [Obsitracer Nix-Shell Activo]"
  '';
}
