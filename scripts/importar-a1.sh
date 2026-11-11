#!/bin/bash
# Pede as senhas sem mostrar na tela e passa pela entrada padrão para scripts/importar-a1.ts.
set -euo pipefail
read -rsp "Prefixo da senha (vem antes do código): " P; echo
read -rsp "Senha alternativa: " S; echo
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
cd /home/ubuntu/emissor
printf '%s\n%s\n' "$P" "$S" | node_modules/.bin/tsx --env-file=.env.local --import ./scripts/server-only-shim.mjs scripts/importar-a1.ts "$@"
