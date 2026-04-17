#!/bin/bash
# install-mac.sh
# Company OS — Mac Installer
# Ausfuehren: bash install-mac.sh

set -e

REPO="https://github.com/Wimmsi82/company-os.git"
INSTALL_DIR="$HOME/Dev/company-os"
VERSION="4.0"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m'

clear
echo ""
echo -e "  ${CYAN}================================================================${NC}"
echo -e "  ${CYAN}  COMPANY OS v$VERSION -- Mac Installer${NC}"
echo -e "  ${CYAN}================================================================${NC}"
echo ""

ok()   { echo -e "  ${GREEN}OK${NC}  $1"; }
warn() { echo -e "  ${RED}(!!)${NC} $1"; }
info() { echo -e "  ${GRAY}     $1${NC}"; }
step() { echo -e "  ${YELLOW}[$1]${NC} $2"; }

# ── HOMEBREW ──────────────────────────────────────────

step "1/5" "Homebrew pruefen ..."
if command -v brew &>/dev/null; then
    ok "Homebrew gefunden"
else
    info "Installiere Homebrew ..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    ok "Homebrew installiert"
fi

# ── NODE.JS ───────────────────────────────────────────

step "2/5" "Node.js pruefen ..."
if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    ok "Node.js gefunden: $NODE_VER"
else
    info "Installiere Node.js ..."
    brew install node
    ok "Node.js installiert"
fi

# ── CLAUDE CODE ───────────────────────────────────────

step "3/5" "Claude Code pruefen ..."
if command -v claude &>/dev/null; then
    CLAUDE_VER=$(claude --version 2>/dev/null || echo "unbekannt")
    ok "Claude Code gefunden: $CLAUDE_VER"
else
    warn "Claude Code nicht gefunden"
    info "Installieren: https://claude.ai/code"
    echo ""
    read -p "  Browser oeffnen? [J/n]: " open_browser
    if [ "$open_browser" != "n" ]; then
        open "https://claude.ai/code"
    fi
    echo ""
    info "Druecke ENTER nachdem Claude Code installiert und eingeloggt ist ..."
    read
fi

# ── COMPANY OS ────────────────────────────────────────

step "4/5" "Company OS installieren ..."

if [ -d "$INSTALL_DIR" ]; then
    info "Verzeichnis existiert -- aktualisiere ..."
    cd "$INSTALL_DIR"
    git pull
else
    mkdir -p "$HOME/Dev"
    git clone "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

npm install
ok "Company OS installiert in $INSTALL_DIR"

# ── SETUP ─────────────────────────────────────────────

step "5/5" "Setup starten ..."
echo ""
echo -e "  ${CYAN}================================================================${NC}"
echo -e "  ${CYAN}  Company OS Setup${NC}"
echo -e "  ${CYAN}================================================================${NC}"
echo ""

node run.js --onboarding

# ── FERTIG ────────────────────────────────────────────

echo ""
echo -e "  ${GREEN}================================================================${NC}"
echo -e "  ${GREEN}  Installation abgeschlossen!${NC}"
echo -e "  ${GREEN}================================================================${NC}"
echo ""
echo -e "  ${CYAN}Verwendung:${NC}"
echo ""
echo -e "  cd $INSTALL_DIR"
echo -e "  node run.js \"Deine erste Frage\""
echo -e "  node run.js --list-consultants"
echo -e "  node run.js --consultant mckinsey \"Frage\""
echo ""
echo -e "  ${GRAY}GitHub: https://github.com/Wimmsi82/company-os${NC}"
echo ""
