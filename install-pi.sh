#!/bin/bash
# install-pi.sh
# Company OS -- Raspberry Pi Installer
# Ausfuehren: bash install-pi.sh

set -e

REPO="https://github.com/Wimmsi82/company-os.git"
INSTALL_DIR="$HOME/Dev/company-os"
SERVICE_NAME="company-os"
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
echo -e "  ${CYAN}  COMPANY OS v$VERSION -- Raspberry Pi Installer${NC}"
echo -e "  ${CYAN}================================================================${NC}"
echo ""

ok()   { echo -e "  ${GREEN}OK${NC}  $1"; }
warn() { echo -e "  ${RED}(!!)${NC} $1"; }
info() { echo -e "  ${GRAY}     $1${NC}"; }
step() { echo -e "  ${YELLOW}[$1]${NC} $2"; }

# ── MODUS ─────────────────────────────────────────────

echo "  Welcher Modus?"
echo ""
echo "  [1]  Claude Code CLI  (kein API Key, interaktiv)"
echo "  [2]  Anthropic API    (API Key, autonomer 24/7-Betrieb)"
echo ""
read -p "  Wahl [1 oder 2]: " MODE_CHOICE

USE_API=false
[ "$MODE_CHOICE" = "2" ] && USE_API=true

# ── SYSTEM-UPDATES ────────────────────────────────────

step "1/6" "System aktualisieren ..."
sudo apt-get update -qq
ok "System aktuell"

# ── NODE.JS ───────────────────────────────────────────

step "2/6" "Node.js pruefen ..."
if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    ok "Node.js gefunden: $NODE_VER"
else
    info "Installiere Node.js 20 (aarch64) ..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    ok "Node.js installiert"
fi

# ── CLAUDE CODE (CLI-Modus) ───────────────────────────

if [ "$USE_API" = "false" ]; then
    step "3/6" "Claude Code pruefen ..."
    if command -v claude &>/dev/null; then
        ok "Claude Code gefunden"
    else
        info "Installiere Claude Code ..."
        npm install -g @anthropic-ai/claude-code
        ok "Claude Code installiert"
        echo ""
        warn "Einloggen erforderlich:"
        info "  claude auth login"
        echo ""
        read -p "  Jetzt einloggen? [J/n]: " do_login
        [ "$do_login" != "n" ] && claude auth login
    fi
else
    step "3/6" "Claude Code (uebersprungen, API-Modus)"
    ok "API-Modus gewaehlt"
fi

# ── COMPANY OS ────────────────────────────────────────

step "4/6" "Company OS installieren ..."

if [ -d "$INSTALL_DIR" ]; then
    info "Aktualisiere bestehende Installation ..."
    cd "$INSTALL_DIR"
    git pull
else
    mkdir -p "$HOME/Dev"
    git clone "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

npm install
ok "Company OS installiert"

# ── SETUP ─────────────────────────────────────────────

step "5/6" "Konfigurieren ..."
echo ""
node run.js --onboarding || true

# ── SYSTEMD SERVICE (API-Modus) ───────────────────────

if [ "$USE_API" = "true" ]; then
    step "6/6" "Als systemd-Service einrichten ..."

    # Service-Datei anpassen
    sed "s|/home/admin|$HOME|g" "$INSTALL_DIR/company-os.service" > /tmp/company-os.service
    sudo cp /tmp/company-os.service /etc/systemd/system/company-os.service
    sudo systemctl daemon-reload
    sudo systemctl enable company-os
    sudo systemctl start company-os

    ok "Service laeuft als $SERVICE_NAME"
    info "Logs: sudo journalctl -u company-os -f"
    info "Status: sudo systemctl status company-os"
else
    step "6/6" "Service-Setup uebersprungen (CLI-Modus)"
    ok "Manueller Start via: node run.js \"Frage\""
fi

# ── FERTIG ────────────────────────────────────────────

PI_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "  ${GREEN}================================================================${NC}"
echo -e "  ${GREEN}  Installation abgeschlossen!${NC}"
echo -e "  ${GREEN}================================================================${NC}"
echo ""
echo -e "  ${CYAN}Verwendung:${NC}"
echo ""
echo -e "  cd $INSTALL_DIR"
echo -e "  node run.js \"Deine erste Frage\""
echo -e "  node run.js --consultant mckinsey \"Frage\""
echo ""
if [ "$USE_API" = "true" ]; then
    echo -e "  ${CYAN}Dashboard:${NC} http://$PI_IP:3000"
    echo ""
fi
echo -e "  ${GRAY}GitHub: https://github.com/Wimmsi82/company-os${NC}"
echo ""
