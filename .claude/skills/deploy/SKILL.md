---
name: deploy
description: Deployment auf Raspberry Pi (admin@192.168.188.153) für Company OS.
  Triggern bei Deployment, systemd, SSH, Pi-spezifischen Problemen.
---

# Deploy — Company OS

## Pi-Infos
Host: admin@192.168.188.153
Arch: aarch64, 16 GB RAM
Pfad: ~/Dev/company-os
Node: >= 20 (prüfen mit node --version)

## Erstinstallation
```bash
ssh admin@192.168.188.153
cd ~/Dev
git clone <repo> company-os
cd company-os
cp .env.example .env && nano .env   # API-Key eintragen
npm install
npm run migrate
sudo cp company-os.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable company-os
sudo systemctl start company-os
```

## Update deployen
```bash
ssh admin@192.168.188.153 "cd ~/Dev/company-os && git pull && npm install && sudo systemctl restart company-os"
```

## Logs
```bash
sudo journalctl -u company-os -f          # Live-Log
sudo journalctl -u company-os --since today
sudo systemctl status company-os
```

## Gotchas
- native bindings (better-sqlite3) brauchen npm rebuild nach Node-Upgrade
- Pi läuft auf aarch64 — kein x86-binary funktioniert
- .env liegt auf Pi, nicht im Repo
- Dashboard: http://192.168.188.153:3000 (nur im lokalen Netz)
- Für Remote-Zugriff: SSH-Tunnel oder Tailscale

## Referenzen
@company-os.service
@CLAUDE.md
