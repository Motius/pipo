# ── P.I.P.O. Windows installer ───────────────────────────────────────
#
# Usage (Windows PowerShell 5.1 or PowerShell 7):
#
#   irm https://raw.githubusercontent.com/Motius/pipo/main/install.ps1 | iex
#
# What this does:
#   1. Checks that WSL2 is installed and has a Linux distribution
#      (offers the exact commands to set it up if not)
#   2. Downloads install.sh BYTE-SAFE to a temp file and runs it inside WSL
#      (never pipe install.sh into bash from PowerShell: PowerShell
#      re-encodes piped text with CRLF line endings, which corrupts the
#      script before bash parses it — the "invalid option name pipefail"
#      error. A file download avoids that entirely.)
#   3. Points you at the native Windows sidecar installer + first start
#
# The pipo brain (daemon) is a Bun application: on Windows it runs inside
# WSL2. The desktop sidecar (Pebble tray/overlay/hotkeys) is a native
# Windows app installed from pipo-Setup.exe.
# ─────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$InstallShUrl = "https://raw.githubusercontent.com/Motius/pipo/main/install.sh"
$SidecarUrl   = "https://github.com/Motius/pipo/releases/download/installer-latest/pipo-Setup.exe"

function Info([string]$m) { Write-Host "  [+] $m" }
function Warn([string]$m) { Write-Host "  [!] $m" -ForegroundColor Yellow }
function Fail([string]$m) { Write-Host "  [x] $m" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Pipo - Windows installer (brain in WSL2 + native sidecar)"
Write-Host ""

# ── 1. WSL2 present and usable? ─────────────────────────────────────
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Fail ("WSL is not installed. Open an Administrator PowerShell and run:  wsl --install  " +
          "then reboot, open your new Linux distribution once to finish its setup, and re-run this installer.")
}

$statusOk = $true
try {
    $null = & wsl.exe --status 2>$null
    if ($LASTEXITCODE -ne 0) { $statusOk = $false }
} catch { $statusOk = $false }
if (-not $statusOk) {
    Fail ("WSL is present but not usable yet. Run:  wsl --install  " +
          "in an Administrator PowerShell, reboot, and re-run this installer.")
}

$distroCount = 0
try {
    $lines = & wsl.exe -l -q 2>$null
    if ($LASTEXITCODE -eq 0 -and $lines) {
        $distroCount = @($lines | Where-Object { $_ -and ("$_" -notmatch '^\s*$') }).Count
    }
} catch { $distroCount = 0 }

if ($distroCount -lt 1) {
    Fail ("WSL2 is installed but has no Linux distribution. Run:  wsl --install -d Ubuntu  " +
          "open the distribution once to finish its user setup, then re-run this installer.")
}
Info "WSL2 is ready"

# ── 2. Download install.sh byte-safe ────────────────────────────────
$tmp = Join-Path $env:TEMP "pipo-install.sh"
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue

if ($curl) {
    & curl.exe -fsSL $InstallShUrl -o $tmp
    if ($LASTEXITCODE -ne 0) { Fail "Could not download install.sh (curl.exe exit $LASTEXITCODE)." }
} else {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $InstallShUrl -OutFile $tmp -UseBasicParsing
    } catch {
        Fail "Could not download install.sh: $($_.Exception.Message)"
    }
}

# Normalize line endings + encoding (BOM-free UTF-8). curl.exe preserves
# bytes, but Invoke-WebRequest on some setups may not — make it idempotent.
$text = [IO.File]::ReadAllText($tmp)
$text = $text.Replace("`r`n", "`n")
[IO.File]::WriteAllText($tmp, $text, (New-Object System.Text.UTF8Encoding($false)))
Info "install.sh downloaded to $tmp"

# ── 3. Run it inside WSL ────────────────────────────────────────────
$wslScript = (& wsl.exe wslpath -u $tmp).Trim()
if ($LASTEXITCODE -ne 0 -or (-not $wslScript)) {
    Fail "Could not translate the script path for WSL. Re-run from a normal user PowerShell."
}

Info "Running the pipo installer inside WSL (this installs Bun, clones the repo, links the CLI)..."
Write-Host ""
& wsl.exe bash "$wslScript"
if ($LASTEXITCODE -ne 0) {
    Fail "The pipo installer failed inside WSL (exit $LASTEXITCODE). Fix the issue printed above and re-run."
}

# ── 4. Next steps ───────────────────────────────────────────────────
Write-Host ""
Write-Host "  ============== Next steps ==============" -ForegroundColor Cyan
Write-Host "  1. Start the brain (inside WSL):"
Write-Host "       wsl bash -lc `"pipo start`""
Write-Host "     then open http://localhost:1846 and finish setup."
Write-Host ""
Write-Host "  2. Desktop sidecar (tray, overlay, hotkeys on Windows itself):"
Write-Host "       download and run  $SidecarUrl"
Write-Host "  3. Enroll this PC in the dashboard:  Settings -> Sidecar."
Write-Host ""
Info "Done."
