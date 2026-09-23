#!/usr/bin/env bash
# Wire the eisensoftware platform standards into a host repository (mirrors eval-driven-dev/scripts/install-host.sh):
#
#   git submodule add git@github.com:hockeyiscool19/monorepo.git platform
#   ./platform/scripts/install-host.sh              # link the skills, write the AGENTS.md section
#   ./platform/scripts/install-host.sh --dry-run    # print what would change, change nothing
#   ./platform/scripts/install-host.sh --uninstall  # remove the links and the section
#
# What it does, idempotently:
#   1. symlinks every plugins/*/skills/<skill> (and plugins/eisen-platform/skills/sites/site-<id>) into the
#      host's .claude/skills/<name> and .cursor/skills/<name>, with relative links (ln -sfn); a path that exists and
#      is not a symlink is left alone with a warning;
#   2. writes or refreshes the block between <!-- eisensoftware-platform:start --> and <!-- eisensoftware-platform:end -->
#      in the host's AGENTS.md.
# The platform must live inside the host as a submodule or a plain directory (a symlink to another checkout is not
# supported). Runs on macOS's bash 3.2: no associative arrays, no mapfile, no realpath --relative-to.
set -euo pipefail

MARKER_START="<!-- eisensoftware-platform:start -->"
MARKER_END="<!-- eisensoftware-platform:end -->"
AGENTS_HEADER="# Agent instructions"
TARGET_DIRS=".claude/skills .cursor/skills"

mode="install"
dry_run=false
for arg in "$@"; do
  case "$arg" in
    --uninstall) mode="uninstall" ;;
    --dry-run) dry_run=true ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "error: unknown option $arg (use --dry-run, --uninstall, --help)" >&2; exit 2 ;;
  esac
done

script_dir="$(cd "$(dirname "$0")" && pwd -P)"
platform_dir="$(cd "$script_dir/.." && pwd -P)"

# A submodule has a .git *file*; a plain copy has none; only the platform checkout itself has a .git directory.
if [[ -d "$platform_dir/.git" ]]; then
  echo "This checkout is the platform itself ($platform_dir): its skills already live under plugins/*/skills."
  echo "Nothing to install. From a host repository run: ./platform/scripts/install-host.sh"
  exit 0
fi

host_root="$(cd "$platform_dir/.." && { git rev-parse --show-toplevel 2>/dev/null || pwd -P; })"
case "$platform_dir" in
  "$host_root"/*) rel="${platform_dir#"$host_root"/}" ;;
  *) echo "error: $platform_dir is not inside the host repository $host_root" >&2; exit 1 ;;
esac
cd "$host_root"
link_prefix="../../$rel/plugins"   # every link lives two directories deep (.claude/skills/<name>)

# The skill's `name:` from its frontmatter, else the directory name.
skill_name() {
  local name
  name="$(sed -n '/^---$/,/^---$/s/^name:[[:space:]]*//p' "$1/SKILL.md" | head -n 1 | sed 's/^["'"'"']//; s/["'"'"']$//')"
  [[ -n "$name" ]] && printf '%s\n' "$name" || basename "$1"
}

linked=0; unchanged=0; skipped=0; removed=0

link_skill() {  # $1 = link path, $2 = relative target
  if [[ -L "$1" ]]; then
    if [[ "$(readlink "$1")" == "$2" ]]; then unchanged=$((unchanged + 1)); return; fi
    if $dry_run; then echo "would relink $1 -> $2"; else ln -sfn "$2" "$1"; echo "relinked $1 -> $2"; fi
    linked=$((linked + 1))
  elif [[ -e "$1" ]]; then
    echo "warning: $1 exists and is not a symlink; leaving it alone (move it aside to let the platform manage it)" >&2
    skipped=$((skipped + 1))
  else
    if $dry_run; then echo "would link $1 -> $2"; else ln -sfn "$2" "$1"; echo "linked $1 -> $2"; fi
    linked=$((linked + 1))
  fi
}

# Current block between the markers (empty when absent).
current_section() {
  [[ -f AGENTS.md ]] || return 0
  awk -v s="$MARKER_START" -v e="$MARKER_END" '$0 == s { p = 1 } p { print } $0 == e { p = 0 }' AGENTS.md
}

section="${MARKER_START}
This host vendors the eisensoftware platform at \`${rel}/\` and links its skills into \`.claude/skills/\` and
\`.cursor/skills/\` (\`./${rel}/scripts/install-host.sh\`; rerun it after \`git submodule update --remote ${rel}\`).
Read \`${rel}/AGENTS.md\` for the full contract. These standards apply to all product code in this repository:
- Styling: components use design tokens only — no hardcoded colors, sizes, radii or durations (skills \`design-tokens\`, \`ui-style-*\`, \`accessibility-ada\`).
- Layout: hexagonal — domain / application / adapters; the domain does no I/O; one composition root (\`hexagonal-architecture\`, \`ports-and-adapters\`).
- Source files stay at or under 400 lines; split by seam, not by line count (\`agent-friendly-codebase\`).
- Images: \`us-central1-docker.pkg.dev/<project>/<repo>/<service>:sha-<12>\`, plus \`v<semver>\` on release tags; never deploy \`:latest\` (\`image-tagging\`).
- Releases: semver \`v*\` tags; release, deploy and publish are separate steps with receipts; promote by tag, never rebuild (\`deploy-versioning\`).
- Joining eisensoftware.com: registry entry, base-path support, \`/health\`, CORS, and the \`register-app\` workflow call after every production deploy (\`site-plugin\`, \`site-<id>\`).
${MARKER_END}"

install() {
  for dir in $TARGET_DIRS; do
    if [[ ! -d "$dir" ]]; then
      if $dry_run; then echo "would create $dir/"; else mkdir -p "$dir"; fi
    fi
  done
  for skill_dir in "$platform_dir"/plugins/*/skills/*/ "$platform_dir"/plugins/eisen-platform/skills/sites/*/; do
    skill_dir="${skill_dir%/}"
    [[ -f "$skill_dir/SKILL.md" ]] || continue
    name="$(skill_name "$skill_dir")"
    target="$link_prefix/${skill_dir#"$platform_dir"/plugins/}"
    for dir in $TARGET_DIRS; do link_skill "$dir/$name" "$target"; done
  done

  if [[ "$(current_section)" == "$section" ]]; then
    echo "AGENTS.md section up to date"
  elif [[ ! -f AGENTS.md ]]; then
    if $dry_run; then echo "would write AGENTS.md"; else printf '%s\n\n%s\n' "$AGENTS_HEADER" "$section" > AGENTS.md; echo "wrote AGENTS.md"; fi
  elif grep -qF "$MARKER_START" AGENTS.md; then
    if $dry_run; then echo "would update the section in AGENTS.md"; else
      tmp="$(mktemp)"; printf '%s\n' "$section" > "$tmp.section"
      awk -v s="$MARKER_START" -v e="$MARKER_END" -v f="$tmp.section" '
        $0 == s { while ((getline line < f) > 0) print line; skip = 1; next }
        $0 == e { skip = 0; next }
        !skip { print }' AGENTS.md > "$tmp" && mv "$tmp" AGENTS.md && rm -f "$tmp.section"
      echo "updated the section in AGENTS.md"
    fi
  else
    if $dry_run; then echo "would append the section to AGENTS.md"; else printf '\n%s\n' "$section" >> AGENTS.md; echo "appended the section to AGENTS.md"; fi
  fi
  echo "done: $linked link(s) written, $unchanged unchanged, $skipped skipped$($dry_run && echo ' (dry run)')"
}

uninstall() {
  for dir in $TARGET_DIRS; do
    [[ -d "$dir" ]] || continue
    for link in "$dir"/*; do
      [[ -L "$link" ]] || continue
      case "$(readlink "$link")" in
        "$link_prefix"/*) if $dry_run; then echo "would unlink $link"; else rm "$link"; echo "unlinked $link"; fi; removed=$((removed + 1)) ;;
      esac
    done
    if ! $dry_run && [[ -d "$dir" ]] && [[ -z "$(ls -A "$dir")" ]]; then
      rmdir "$dir"; echo "removed empty $dir/"
      parent="${dir%/*}"; [[ -z "$(ls -A "$parent")" ]] && rmdir "$parent" && echo "removed empty $parent/"
    fi
  done
  if [[ -f AGENTS.md ]] && grep -qF "$MARKER_START" AGENTS.md; then
    if $dry_run; then echo "would remove the section from AGENTS.md"; else
      tmp="$(mktemp)"
      awk -v s="$MARKER_START" -v e="$MARKER_END" '$0 == s { skip = 1; next } $0 == e { skip = 0; next } !skip { print }' AGENTS.md \
        | awk '{ lines[NR] = $0 } END { n = NR; while (n > 0 && lines[n] == "") n--; for (i = 1; i <= n; i++) print lines[i] }' > "$tmp"
      if [[ "$(cat "$tmp")" == "$AGENTS_HEADER" || ! -s "$tmp" ]]; then rm -f "$tmp" AGENTS.md; echo "removed AGENTS.md (it held only the platform section)"
      else mv "$tmp" AGENTS.md; echo "removed the section from AGENTS.md"; fi
    fi
  else
    echo "AGENTS.md has no platform section"
  fi
  echo "done: $removed link(s) removed$($dry_run && echo ' (dry run)')"
}

echo "host: $host_root · platform: $rel/ · mode: $mode"
if [[ "$mode" == "uninstall" ]]; then uninstall; else install; fi
