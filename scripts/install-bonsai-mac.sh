#!/usr/bin/env bash
# scripts/install-bonsai-mac.sh
# Richtet Bonsai (PrismML llama-server, Metal) auf dem Mac als LaunchAgent ein.
# Der Pi ruft das Modell über Tailscale auf. Der Server hört nur auf der
# Tailscale-IP und verlangt einen API-Key.
#
# Nutzung:  bash scripts/install-bonsai-mac.sh [8B|4B|1.7B]      (Default: 8B)
# Optional: BONSAI_DIR=…  BONSAI_PORT=8080  BONSAI_GGUF=/pfad/zur/datei.gguf
set -euo pipefail

MODEL="${1:-8B}"
DIR="${BONSAI_DIR:-$HOME/Dev/modelle/Bonsai-demo}"
PORT="${BONSAI_PORT:-8080}"
LABEL="ai.prism.bonsai"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
KEYFILE="$HOME/.config/bonsai/api-key"
LOG="$HOME/Library/Logs/bonsai.log"

case "$MODEL" in 8B|4B|1.7B) ;; *) echo "Unbekannte Größe: $MODEL (8B|4B|1.7B)"; exit 1;; esac
[ "$(uname -s)" = "Darwin" ] || { echo "Dieses Skript ist für macOS. Am Pi: scripts/install-bonsai-pi.sh (nicht empfohlen)."; exit 1; }

echo "── 1/5 Bonsai-demo in $DIR"
if [ ! -d "$DIR/.git" ]; then
  mkdir -p "$(dirname "$DIR")"
  git clone https://github.com/PrismML-Eng/Bonsai-demo.git "$DIR"
fi
cd "$DIR"

find_model() {
  if [ -n "${BONSAI_GGUF:-}" ]; then echo "$BONSAI_GGUF"; return; fi
  # PQ2_0 ist laut Bonsai-README auf Metal das schnellere Format, sonst das g64-Format
  ls models/ternary-gguf/"$MODEL"/*PQ2_0*.gguf 2>/dev/null | head -1 && return
  ls models/ternary-gguf/"$MODEL"/*g64*.gguf 2>/dev/null | head -1
}

GGUF="$(find_model || true)"
if [ -z "$GGUF" ]; then
  echo "── 2/5 Modell $MODEL fehlt, starte setup.sh (lädt nur, was fehlt)"
  BONSAI_FAMILY=ternary BONSAI_MODEL="$MODEL" ./setup.sh
  GGUF="$(find_model || true)"
else
  echo "── 2/5 Modell vorhanden"
fi
[ -n "$GGUF" ] && [ -f "$GGUF" ] || { echo "Keine GGUF-Datei für $MODEL unter $DIR/models/ternary-gguf/$MODEL gefunden."; exit 1; }
case "$GGUF" in /*) ;; *) GGUF="$DIR/$GGUF";; esac
echo "   Modell: $GGUF"

# Direkt das Binary starten, nicht scripts/start_llama_server.sh:
# das Skript wählt das Backend selbst (am Pi führte das zum falschen Binary).
BIN=""
for b in bin/mac/llama-server llama.cpp/build-mac/bin/llama-server llama.cpp/build/bin/llama-server; do
  if [ -x "$b" ]; then BIN="$DIR/$b"; break; fi
done
[ -n "$BIN" ] || { echo "llama-server nicht gefunden. Einmal ./setup.sh im Bonsai-demo-Ordner laufen lassen."; exit 1; }
echo "   Binary: $BIN"

echo "── 3/5 Tailscale-IP"
TS=""
for t in tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do
  if command -v "$t" >/dev/null 2>&1 || [ -x "$t" ]; then
    TS="$("$t" ip -4 2>/dev/null | head -1 || true)"
    [ -n "$TS" ] && break
  fi
done
[ -n "$TS" ] || { echo "Keine Tailscale-IP gefunden. Tailscale am Mac starten und anmelden, dann erneut ausführen."; exit 1; }
echo "   $TS"

echo "── 4/5 API-Key"
mkdir -p "$(dirname "$KEYFILE")"
if [ ! -s "$KEYFILE" ]; then
  (umask 077; openssl rand -hex 24 > "$KEYFILE")
  echo "   neu erzeugt: $KEYFILE"
else
  echo "   vorhanden: $KEYFILE"
fi
chmod 600 "$KEYFILE"
KEY="$(cat "$KEYFILE")"

echo "── 5/5 LaunchAgent $LABEL"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
ARGS=("$BIN" -m "$GGUF" --host "$TS" --port "$PORT" --api-key-file "$KEYFILE"
      -c 8192 -np 1 --temp 0.5 --top-p 0.85 --top-k 20 --min-p 0
      --reasoning-budget 0 --reasoning-format none)
{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
  echo '<plist version="1.0">'
  echo '<dict>'
  echo "  <key>Label</key><string>$LABEL</string>"
  echo '  <key>ProgramArguments</key>'
  echo '  <array>'
  for a in "${ARGS[@]}"; do echo "    <string>$(xml "$a")</string>"; done
  echo '  </array>'
  echo "  <key>WorkingDirectory</key><string>$(xml "$DIR")</string>"
  echo '  <key>RunAtLoad</key><true/>'
  echo '  <key>KeepAlive</key><true/>'
  # Startet beim Login oft vor Tailscale: dann scheitert der Bind, launchd versucht es nach 30 s erneut
  echo '  <key>ThrottleInterval</key><integer>30</integer>'
  echo "  <key>StandardOutPath</key><string>$(xml "$LOG")</string>"
  echo "  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>"
  echo '</dict>'
  echo '</plist>'
} > "$PLIST"
plutil -lint "$PLIST" >/dev/null

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

printf '   warte auf das Modell '
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "http://$TS:$PORT/health" >/dev/null 2>&1; then echo ' bereit'; break; fi
  printf '.'; sleep 3
done
curl -fsS --max-time 2 "http://$TS:$PORT/health" >/dev/null 2>&1 || { echo; echo "Server antwortet nicht. Log: tail -50 $LOG"; exit 1; }

echo
echo "Fertig. Bonsai $MODEL läuft auf http://$TS:$PORT (nur im Tailnet, mit API-Key)."
echo
echo "In ~/Dev/company-os/.env auf dem Pi eintragen:"
echo "  LOCAL_LLM_URL=http://$TS:$PORT"
echo "  LOCAL_LLM_API_KEY=$KEY"
echo
echo "Log:       tail -f $LOG"
echo "Stoppen:   launchctl bootout gui/$(id -u)/$LABEL"
echo "Hinweis:   Schläft der Mac, antwortet der Chat nur mit Vault-Treffern."
echo "           Am Netzteil wach halten: sudo pmset -c sleep 0"
