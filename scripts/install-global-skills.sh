#!/usr/bin/env bash
# Installiert Skills aus dem offiziellen Anthropic Skills-Repo
# (https://github.com/anthropics/skills) global nach ~/.claude/skills.
#
# Verwendung:
#   ./scripts/install-global-skills.sh                # installiert Default-Skills
#   ./scripts/install-global-skills.sh pdf xlsx       # installiert bestimmte Skills
#   ./scripts/install-global-skills.sh --all          # installiert alle Skills
#   ./scripts/install-global-skills.sh --list         # zeigt verfuegbare Skills
set -euo pipefail

REPO_URL="https://github.com/anthropics/skills.git"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
DEFAULT_SKILLS=(frontend-design)

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Klone $REPO_URL ..."
git clone --depth 1 --quiet "$REPO_URL" "$TMP_DIR/skills-repo"
SRC="$TMP_DIR/skills-repo/skills"

if [[ "${1:-}" == "--list" ]]; then
  echo "Verfuegbare Skills:"
  ls -1 "$SRC"
  exit 0
fi

if [[ "${1:-}" == "--all" ]]; then
  mapfile -t SELECTED < <(ls -1 "$SRC")
elif [[ $# -gt 0 ]]; then
  SELECTED=("$@")
else
  SELECTED=("${DEFAULT_SKILLS[@]}")
fi

mkdir -p "$SKILLS_DIR"

for skill in "${SELECTED[@]}"; do
  if [[ ! -d "$SRC/$skill" ]]; then
    echo "WARNUNG: Skill '$skill' nicht im Repo gefunden — uebersprungen." >&2
    continue
  fi
  rm -rf "$SKILLS_DIR/$skill"
  cp -r "$SRC/$skill" "$SKILLS_DIR/$skill"
  echo "Installiert: $skill -> $SKILLS_DIR/$skill"
done

echo "Fertig. Skills sind ab der naechsten Claude-Code-Session aktiv."
