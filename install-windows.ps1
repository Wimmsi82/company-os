# install-windows.ps1
# Company OS — Windows Installer
# Ausfuehren als Administrator in PowerShell:
# Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
# .\install-windows.ps1

$ErrorActionPreference = "Stop"
$VERSION = "4.0"
$REPO = "https://github.com/Wimmsi82/company-os.git"
$INSTALL_DIR = "$env:USERPROFILE\Dev\company-os"

function Write-Header {
    Clear-Host
    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host "    COMPANY OS v$VERSION -- Windows Installer" -ForegroundColor Cyan
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($n, $text) {
    Write-Host "  [$n] $text" -ForegroundColor Yellow
}

function Write-OK($text) {
    Write-Host "  OK  $text" -ForegroundColor Green
}

function Write-Warn($text) {
    Write-Host "  (!!) $text" -ForegroundColor Red
}

function Write-Info($text) {
    Write-Host "       $text" -ForegroundColor Gray
}

function Pause-Continue {
    Write-Host ""
    Write-Host "  Druecke ENTER um fortzufahren ..." -ForegroundColor Gray
    Read-Host
}

# ── ADMIN CHECK ───────────────────────────────────────

Write-Header

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warn "Bitte als Administrator ausfuehren:"
    Write-Info "Rechtsklick auf PowerShell -> 'Als Administrator ausfuehren'"
    Write-Info "Dann nochmal: .\install-windows.ps1"
    exit 1
}

Write-OK "Administrator-Rechte vorhanden"
Write-Host ""

# ── MODUS WAEHLEN ─────────────────────────────────────

Write-Host "  Wie soll Company OS laufen?" -ForegroundColor White
Write-Host ""
Write-Host "  [1]  WSL2 + Claude Code  (empfohlen)" -ForegroundColor White
Write-Info "       Volle Funktionalitaet, kostenlos mit Claude Max-Plan"
Write-Host ""
Write-Host "  [2]  Anthropic API       (direkt auf Windows)" -ForegroundColor White
Write-Info "       Kein WSL2 noetig, API Key erforderlich"
Write-Host ""

do {
    $choice = Read-Host "  Deine Wahl [1 oder 2]"
} while ($choice -notin @("1", "2"))

$useWSL = $choice -eq "1"

# ── WSL2 SETUP ────────────────────────────────────────

if ($useWSL) {
    Write-Host ""
    Write-Step "1/5" "WSL2 pruefen ..."

    $wslInstalled = $false
    try {
        $wslOutput = wsl --status 2>&1
        $wslInstalled = $true
        Write-OK "WSL2 bereits installiert"
    } catch {
        Write-Warn "WSL2 nicht gefunden"
    }

    if (-not $wslInstalled) {
        Write-Info "Installiere WSL2 (Ubuntu) ..."
        Write-Info "Das kann 5-10 Minuten dauern und einen Neustart erfordern."
        Write-Host ""
        $confirm = Read-Host "  WSL2 jetzt installieren? [J/n]"
        if ($confirm -ne "n") {
            wsl --install -d Ubuntu
            Write-Host ""
            Write-Warn "Neustart erforderlich!"
            Write-Info "Nach dem Neustart dieses Script nochmal ausfuehren."
            Write-Info "Ubuntu wird beim ersten Start nach Benutzername und Passwort fragen."
            Pause-Continue
            Restart-Computer -Confirm
            exit
        }
    }

    # Ubuntu verfuegbar?
    $ubuntuAvail = $false
    try {
        wsl -d Ubuntu echo "ok" 2>&1 | Out-Null
        $ubuntuAvail = $true
    } catch {}

    if (-not $ubuntuAvail) {
        Write-Warn "Ubuntu-Distribution nicht gefunden."
        Write-Info "Starte Ubuntu einmal manuell und richte einen Benutzer ein:"
        Write-Info "Start -> Ubuntu -> Benutzername + Passwort eingeben"
        Pause-Continue
    }

    # ── NODE IN WSL2 ──────────────────────────────────

    Write-Step "2/5" "Node.js in WSL2 pruefen ..."

    $nodeInWSL = wsl -d Ubuntu bash -c "node --version 2>/dev/null" 2>&1
    if ($nodeInWSL -match "v\d+") {
        Write-OK "Node.js gefunden: $nodeInWSL"
    } else {
        Write-Info "Installiere Node.js in WSL2 ..."
        wsl -d Ubuntu bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
        Write-OK "Node.js installiert"
    }

    # ── CLAUDE CODE IN WSL2 ───────────────────────────

    Write-Step "3/5" "Claude Code in WSL2 pruefen ..."

    $claudeInWSL = wsl -d Ubuntu bash -c "which claude 2>/dev/null" 2>&1
    if ($claudeInWSL -match "claude") {
        Write-OK "Claude Code gefunden"
    } else {
        Write-Info "Installiere Claude Code in WSL2 ..."
        wsl -d Ubuntu bash -c "npm install -g @anthropic-ai/claude-code"
        Write-OK "Claude Code installiert"
        Write-Host ""
        Write-Warn "Claude Code Login erforderlich!"
        Write-Info "Fuehre in einem WSL2-Terminal aus:"
        Write-Info "  claude auth login"
        Write-Host ""
        $doLogin = Read-Host "  Jetzt einloggen? [J/n]"
        if ($doLogin -ne "n") {
            wsl -d Ubuntu bash -c "claude auth login"
        }
    }

    # ── COMPANY OS KLONEN ─────────────────────────────

    Write-Step "4/5" "Company OS installieren ..."

    $wslInstallDir = "/home/$(wsl -d Ubuntu bash -c 'whoami')/Dev/company-os"
    $wslDirExists = wsl -d Ubuntu bash -c "[ -d '$wslInstallDir' ] && echo 'yes'" 2>&1

    if ($wslDirExists -eq "yes") {
        Write-Info "Verzeichnis existiert bereits -- aktualisiere ..."
        wsl -d Ubuntu bash -c "cd '$wslInstallDir' && git pull"
    } else {
        wsl -d Ubuntu bash -c "mkdir -p ~/Dev && git clone '$REPO' '$wslInstallDir'"
    }

    Write-Info "Installiere Abhaengigkeiten ..."
    wsl -d Ubuntu bash -c "cd '$wslInstallDir' && npm install"
    Write-OK "Company OS installiert"

    # ── SETUP STARTEN ─────────────────────────────────

    Write-Step "5/5" "Setup starten ..."
    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host "    Company OS Setup" -ForegroundColor Cyan
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host ""

    wsl -d Ubuntu bash -c "cd '$wslInstallDir' && node run.js --onboarding"

    # ── FERTIG ────────────────────────────────────────

    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor Green
    Write-Host "    Installation abgeschlossen!" -ForegroundColor Green
    Write-Host "  ================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Verwendung (in WSL2 Terminal):" -ForegroundColor White
    Write-Host ""
    Write-Host "    cd ~/Dev/company-os" -ForegroundColor Cyan
    Write-Host "    node run.js `"Deine Frage`"" -ForegroundColor Cyan
    Write-Host "    node run.js --list-consultants" -ForegroundColor Cyan
    Write-Host "    node run.js --consultant mckinsey `"Frage`"" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Dashboard (API-Modus):" -ForegroundColor White
    Write-Host "    http://localhost:3000" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  GitHub: https://github.com/Wimmsi82/company-os" -ForegroundColor Gray
    Write-Host ""

} else {

    # ── API-MODUS DIREKT AUF WINDOWS ─────────────────

    Write-Step "1/4" "Git pruefen ..."
    try {
        git --version | Out-Null
        Write-OK "Git gefunden"
    } catch {
        Write-Warn "Git nicht gefunden. Installieren von https://git-scm.com"
        Start-Process "https://git-scm.com/download/win"
        Write-Info "Nach der Installation dieses Script nochmal ausfuehren."
        exit 1
    }

    Write-Step "2/4" "Node.js pruefen ..."
    try {
        $nodeVer = node --version
        Write-OK "Node.js gefunden: $nodeVer"
    } catch {
        Write-Warn "Node.js nicht gefunden. Installieren von https://nodejs.org"
        Start-Process "https://nodejs.org"
        Write-Info "Nach der Installation dieses Script nochmal ausfuehren."
        exit 1
    }

    Write-Step "3/4" "Company OS installieren ..."

    if (Test-Path $INSTALL_DIR) {
        Write-Info "Verzeichnis existiert -- aktualisiere ..."
        Set-Location $INSTALL_DIR
        git pull
    } else {
        New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\Dev" | Out-Null
        git clone $REPO $INSTALL_DIR
        Set-Location $INSTALL_DIR
    }

    npm install

    # .env erstellen
    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        # API-Modus setzen
        (Get-Content ".env") -replace "CLAUDE_MODE=cli", "CLAUDE_MODE=api" | Set-Content ".env"
    }

    Write-OK "Company OS installiert"

    Write-Step "4/4" "Setup starten ..."
    Write-Host ""
    node setup.js

    # ── FERTIG ────────────────────────────────────────

    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor Green
    Write-Host "    Installation abgeschlossen!" -ForegroundColor Green
    Write-Host "  ================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Verwendung (in PowerShell, aus $INSTALL_DIR):" -ForegroundColor White
    Write-Host ""
    Write-Host "    node run.js `"Deine Frage`"" -ForegroundColor Cyan
    Write-Host "    node run.js --list-consultants" -ForegroundColor Cyan
    Write-Host "    node run.js --consultant mckinsey `"Frage`"" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Dashboard: http://localhost:3000 (nach npm start)" -ForegroundColor Cyan
    Write-Host "  GitHub: https://github.com/Wimmsi82/company-os" -ForegroundColor Gray
    Write-Host ""
}
