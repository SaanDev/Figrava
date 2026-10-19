#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for command in node npm npx pkg-config sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$command" >&2
    exit 1
  fi
done

if ! pkg-config --exists gtk+-3.0 webkit2gtk-4.1; then
  cat >&2 <<'EOF'
Missing Linux desktop build dependencies. Install the packages listed in the
"Linux desktop development" section of README.md, then retry.
EOF
  exit 1
fi

printf 'Building Figrava Linux .deb package...\n'
npx tauri build --bundles deb

artifacts=(target/release/bundle/deb/*.deb)
if ((${#artifacts[@]} == 0)); then
  printf 'Tauri completed without producing a .deb package.\n' >&2
  exit 1
fi

mkdir -p release
cp -- "${artifacts[@]}" release/
(
  cd release
  sha256sum -- *.deb > SHA256SUMS.txt
)

printf '\nLinux release artifacts:\n'
printf '  %s\n' "${artifacts[@]//target\/release\/bundle\/deb\//release\/}"
printf '  release/SHA256SUMS.txt\n'
