#!/usr/bin/env bash
# a11y-audit.sh — run axe-core against a URL or a local HTML file; exit non-zero on WCAG violations.
#
# Usage:  a11y-audit.sh <url-or-file> [extra @axe-core/cli options...]
#   a11y-audit.sh http://localhost:5173/
#   a11y-audit.sh plugins/eisen-design/mockups/reference.html --save report.json
#
# Needs: Node 18+ (for npx) and Google Chrome. @axe-core/cli drives a headless Chrome through
# chromedriver; on macOS `brew install --cask google-chrome`, or point CHROME_PATH at the binary.
#
# Environment (all optional):
#   A11Y_TAGS            axe rule tags, default wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa (add best-practice to widen)
#   AXE_CLI              npx package spec, default @axe-core/cli@4
#   CHROME_PATH          path to the Chrome executable when it is not in the default place
#   A11Y_CHROME_OPTIONS  Chrome flags, comma separated, default headless,no-sandbox,disable-gpu
#
# Exit: 0 no violations · 1 violations found · 2 usage or environment error (chromedriver failures
# surface as axe's own non-zero status).
set -euo pipefail

usage() { sed -n '2,18p' "$0" | sed -e 's/^# \{0,1\}//'; }

if [[ $# -lt 1 || "$1" == "-h" || "$1" == "--help" ]]; then
  usage
  exit 2
fi

target=$1
shift

# A local file becomes an absolute file:// URL; a bare host gets http://. Anything with a scheme passes through.
if [[ -f "$target" ]]; then
  target="file://$(cd "$(dirname "$target")" && pwd)/$(basename "$target")"
elif [[ ! "$target" =~ ^[A-Za-z][A-Za-z0-9+.-]*:// ]]; then
  target="http://$target"
fi

command -v npx >/dev/null 2>&1 || { echo "error: npx not found; install Node 18 or newer" >&2; exit 2; }

chrome_args=()
if [[ -n "${CHROME_PATH:-}" ]]; then
  [[ -x "$CHROME_PATH" ]] || { echo "error: CHROME_PATH=$CHROME_PATH is not executable" >&2; exit 2; }
  chrome_args=(--chrome-path "$CHROME_PATH")
elif [[ "$(uname -s)" == "Darwin" && ! -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  echo "warning: Google Chrome not found in /Applications; axe needs Chrome (brew install --cask google-chrome) or CHROME_PATH" >&2
fi

tags=${A11Y_TAGS:-wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa}
echo "axe-core → $target (tags: $tags)"

# --exit makes axe return 1 when any violation is found. Extra arguments go straight to axe.
exec npx --yes "${AXE_CLI:-@axe-core/cli@4}" "$target" \
  --tags "$tags" \
  --chrome-options "${A11Y_CHROME_OPTIONS:-headless,no-sandbox,disable-gpu}" \
  ${chrome_args[@]+"${chrome_args[@]}"} \
  --exit "$@"
