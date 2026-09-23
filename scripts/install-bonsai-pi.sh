#!/usr/bin/env bash
# scripts/install-bonsai-pi.sh
# Installiert Bonsai (PrismML) auf dem Raspberry Pi 5 als systemd-Dienst.
#
# NICHT EMPFOHLEN: Auf dem Pi 5 stürzt Vulkan bei jeder Anfrage ab, und die CPU
# schafft nur ~7 Token/s beim Einlesen (3 bis 4 min pro Vault-Frage). Messwerte
# in docs/ASSISTENT.md, Abschnitt Modellwahl. Standard: scripts/install-bonsai-mac.sh.
#
# Nutzung:  bash scripts/install-bonsai-pi.sh [8B|4B|1.7B|27B]
# Default:  8B — 27B passt in 16 GB RAM, ist auf der Pi-CPU aber vermutlich zu
#           langsam für Chat. Nach der Installation mit scripts/bonsai-bench.js messen.
set -euo pipefail

MODEL="${1:-8B}"
DIR="$HOME/Dev/modelle/Bonsai-demo"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

case "$MODEL" in 27B|8B|4B|1.7B) ;; *) echo "Unbekannte Größe: $MODEL (27B|8B|4B|1.7B)"; exit 1;; esac
# Bonsai 2 (das Standard-Familie im Demo-Repo) gibt es nur als 27B.
# Alle kleineren Größen laufen über die Ternary-Bonsai-Familie.
if [ "$MODEL" = "27B" ]; then FAMILY="bonsai2"; else FAMILY="ternary"; fi
[ "$(uname -m)" = "aarch64" ] || echo "Hinweis: kein aarch64 ($(uname -m)) — Skript ist für den Pi gedacht."

echo "── 1/4 Build-Werkzeuge"
sudo apt-get update -qq
sudo apt-get install -y -qq git cmake build-essential curl

echo "── 2/4 Bonsai-demo nach $DIR"
mkdir -p "$(dirname "$DIR")"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone https://github.com/PrismML-Eng/Bonsai-demo.git "$DIR"; fi

echo "── 3/4 Setup (lädt Modell $FAMILY/$MODEL, baut llama.cpp-Fork für CPU/arm64)"
cd "$DIR"
# setup.sh überspringt bereits erledigte Schritte (Modelle, Binaries)
BONSAI_FAMILY="$FAMILY" BONSAI_MODEL="$MODEL" ./setup.sh
# Falls setup.sh auf Linux keine passenden Binaries lädt, CPU-Build erzwingen
[ -d bin/cpu ] || ./scripts/build_cpu_linux.sh

echo "── 4/4 systemd-Dienst"
sed "s/^Environment=BONSAI_MODEL=.*/Environment=BONSAI_MODEL=$MODEL/; s/^Environment=BONSAI_FAMILY=.*/Environment=BONSAI_FAMILY=$FAMILY/" "$REPO/deploy/bonsai.service" \
  | sed "s#/home/admin#$HOME#g; s/^User=admin/User=$USER/" \
  | sudo tee /etc/systemd/system/bonsai.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now bonsai

echo
echo "Fertig. Status:   sudo systemctl status bonsai"
echo "Logs:            sudo journalctl -u bonsai -f"
echo "Tempo messen:    node $REPO/scripts/bonsai-bench.js"
echo "Company OS .env: LOCAL_LLM_URL=http://127.0.0.1:8080"
