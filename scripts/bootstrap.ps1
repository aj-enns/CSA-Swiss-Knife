<#
.SYNOPSIS
  One-line bootstrap for MCAPS IQ on Windows.
  Installs all prerequisites, clones the repo, authenticates, and opens VS Code.

.DESCRIPTION
  Paste this into any PowerShell terminal:
    irm https://raw.githubusercontent.com/Microsoft/MCAPS-IQ/main/scripts/bootstrap.ps1 | iex

  Or run locally after cloning:
    .\scripts\bootstrap.ps1

  Flags:
    -SkipClone    Skip git clone (use when already in the repo directory)
    -SkipAuth     Skip Azure + GitHub auth steps
    -CheckOnly    Only verify prerequisites, don't install anything
    -CloneDir     Where to clone the repo (default: C:\Temp\mcaps-iq)
    -WithObsidian Install Obsidian + scaffold vault (skips prompt)
    -NoObsidian   Skip Obsidian setup entirely (skips prompt)

.NOTES
  Requires: PowerShell 5.1+ to bootstrap (ships with Windows 10/11).
  The script will install PowerShell 7+ (pwsh) if not already present.
  Elevated: Not required, but winget may prompt UAC for installs
#>
[CmdletBinding()]
param(
  [switch]$SkipClone,
  [switch]$SkipAuth,
  [switch]$CheckOnly,
  [switch]$WithObsidian,
  [switch]$NoObsidian,
  [string]$CloneDir = "C:\Temp\mcaps-iq"
)

$ErrorActionPreference = "Stop"

# ── Helpers ──────────────────────────────────────────────────────────
function Write-Step  { param([string]$Msg) Write-Host "`n━━━ $Msg ━━━" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host "  ✔ $Msg" -ForegroundColor Green }
function Write-Warn  { param([string]$Msg) Write-Host "  ⚠ $Msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$Msg) Write-Host "  ✖ $Msg" -ForegroundColor Red }

function Test-Command {
  param([string]$Name)
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Resolve-CodeCmd {
  # Check PATH first (stable takes priority)
  foreach ($candidate in @("code", "code-insiders")) {
    if (Test-Command $candidate) { return $candidate }
  }

  # VS Code's bin dir is often missing from PATH after a fresh winget install.
  # Probe known locations and patch $env:Path for the rest of this session.
  $probeDirs = @(
    "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin"
    "$env:LOCALAPPDATA\Programs\Microsoft VS Code Insiders\bin"
    "$env:ProgramFiles\Microsoft VS Code\bin"
    "$env:ProgramFiles\Microsoft VS Code Insiders\bin"
    "${env:ProgramFiles(x86)}\Microsoft VS Code\bin"
  )
  foreach ($dir in $probeDirs) {
    if (Test-Path (Join-Path $dir "code.cmd")) {
      $env:Path = "$dir;$env:Path"
      return "code"
    }
    if (Test-Path (Join-Path $dir "code-insiders.cmd")) {
      $env:Path = "$dir;$env:Path"
      return "code-insiders"
    }
  }

  return $null
}

# Get VS Code version from product.json on disk — never launches Code.exe.
function Get-CodeVersion {
  param([string]$Cmd)
  $isInsiders = $Cmd -eq "code-insiders"
  $installRoots = if ($isInsiders) {
    @("$env:LOCALAPPDATA\Programs\Microsoft VS Code Insiders",
      "$env:ProgramFiles\Microsoft VS Code Insiders")
  } else {
    @("$env:LOCALAPPDATA\Programs\Microsoft VS Code",
      "$env:ProgramFiles\Microsoft VS Code",
      "${env:ProgramFiles(x86)}\Microsoft VS Code")
  }
  foreach ($root in $installRoots) {
    if (-not (Test-Path $root)) { continue }
    # product.json lives inside a versioned subdirectory (e.g. e7fb5e96c0/)
    $productFiles = Get-ChildItem $root -Recurse -Filter "product.json" -Depth 3 -ErrorAction SilentlyContinue |
                    Where-Object { $_.FullName -match 'resources[\\/]app[\\/]product\.json$' } |
                    Select-Object -First 1
    if ($productFiles) {
      try {
        $ver = (Get-Content $productFiles.FullName -Raw | ConvertFrom-Json).version
        if ($ver) { return $ver }
      } catch {
        Write-Verbose "Could not parse product.json: $_"
      }
    }
  }
  return "unknown"
}

# Check if a VS Code extension is installed by scanning the extensions directory.
function Test-CodeExtension {
  param([string]$ExtensionId, [string]$Cmd)
  $extDir = if ($Cmd -eq "code-insiders") {
    "$env:USERPROFILE\.vscode-insiders\extensions"
  } else {
    "$env:USERPROFILE\.vscode\extensions"
  }
  if (-not (Test-Path $extDir)) { return $false }
  $found = Get-ChildItem $extDir -Directory -Name -ErrorAction SilentlyContinue |
           Where-Object { $_ -match "^$([regex]::Escape($ExtensionId))-" }
  return [bool]$found
}

function Test-Winget-Installed {
  param([string]$PackageId)
  if (-not (Test-Command "winget")) { return $false }
  $result = winget list --id $PackageId --accept-source-agreements 2>$null
  return ($LASTEXITCODE -eq 0 -and ($result | Select-String $PackageId))
}

function Install-Via-Winget {
  param([string]$PackageId, [string]$Label)
  if (-not (Test-Command "winget")) {
    Write-Fail "winget not found — install $Label manually"
    return $false
  }
  # Already installed — treat as success
  if (Test-Winget-Installed $PackageId) {
    Write-Ok "$Label already installed (winget)"
    return $true
  }
  Write-Host "  Installing $Label via winget..." -ForegroundColor Gray
  winget install $PackageId --silent --accept-package-agreements --accept-source-agreements 2>$null
  Refresh-Path
  return $true
}

# ── Step 1: Check / Install Prerequisites ────────────────────────────
$allGood = $true

Write-Step "Checking prerequisites"

# -- PowerShell 7 --
if (Test-Command "pwsh") {
  $pwshVer = & pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()' 2>$null
  $pwshMajor = [int]($pwshVer -replace '^(\d+).*', '$1')
  if ($pwshMajor -ge 7) {
    Write-Ok "PowerShell $pwshVer"
  } else {
    Write-Warn "PowerShell $pwshVer found — need 7+"
    if (-not $CheckOnly) {
      $null = Install-Via-Winget "Microsoft.PowerShell" "PowerShell 7"
      Refresh-Path
    } else { $allGood = $false }
  }
} else {
  Write-Warn "PowerShell 7 (pwsh) not found"
  if (-not $CheckOnly) {
    $null = Install-Via-Winget "Microsoft.PowerShell" "PowerShell 7"
    Refresh-Path
    if (Test-Command "pwsh") { Write-Ok "PowerShell 7 installed" } else { Write-Fail "PowerShell 7 install failed"; $allGood = $false }
  } else { $allGood = $false }
}

# -- VS Code (stable or Insiders) --
# Resolve once and cache for the rest of the script (extension check + final open).
$codeCmd = Resolve-CodeCmd
if ($codeCmd) {
  $codeVer = Get-CodeVersion $codeCmd
  $codeLabel = if ($codeCmd -eq "code-insiders") { "VS Code Insiders" } else { "VS Code" }
  Write-Ok "$codeLabel $codeVer"
} else {
  Write-Warn "VS Code not found"
  if (-not $CheckOnly) {
    # Try stable first, then Insiders
    $null = Install-Via-Winget "Microsoft.VisualStudioCode" "VS Code"
    Refresh-Path
    $codeCmd = Resolve-CodeCmd
    if (-not $codeCmd) {
      $null = Install-Via-Winget "Microsoft.VisualStudioCode.Insiders" "VS Code Insiders"
      Refresh-Path
      $codeCmd = Resolve-CodeCmd
    }
    if ($codeCmd) {
      $codeVer = Get-CodeVersion $codeCmd
      $codeLabel = if ($codeCmd -eq "code-insiders") { "VS Code Insiders" } else { "VS Code" }
      Write-Ok "$codeLabel $codeVer (resolved via path probe)"
    } else {
      Write-Fail "VS Code install failed — could not find 'code' command"
      Write-Fail "  Try closing and reopening your terminal, then re-run this script"
      $allGood = $false
    }
  } else { $allGood = $false }
}

# -- Git --
if (Test-Command "git") {
  $gitVer = git --version 2>$null
  Write-Ok $gitVer
} else {
  Write-Warn "Git not found"
  if (-not $CheckOnly) {
    $null = Install-Via-Winget "Git.Git" "Git"
    Refresh-Path
    if (Test-Command "git") { Write-Ok "Git installed" } else { Write-Fail "Git install failed"; $allGood = $false }
  } else { $allGood = $false }
}

# -- Node.js --
if (Test-Command "node") {
  $nodeVer = node --version 2>$null
  $major = [int]($nodeVer -replace '^v(\d+).*', '$1')
  if ($major -ge 18) {
    Write-Ok "Node.js $nodeVer"
  } else {
    Write-Warn "Node.js $nodeVer found — need v18+"
    if (-not $CheckOnly) {
      $null = Install-Via-Winget "OpenJS.NodeJS.LTS" "Node.js LTS"
      Refresh-Path
    } else { $allGood = $false }
  }
} else {
  Write-Warn "Node.js not found"
  if (-not $CheckOnly) {
    $null = Install-Via-Winget "OpenJS.NodeJS.LTS" "Node.js LTS"
    Refresh-Path
    if (Test-Command "node") { Write-Ok "Node.js installed" } else { Write-Fail "Node.js install failed"; $allGood = $false }
  } else { $allGood = $false }
}

# -- GitHub CLI --
if (Test-Command "gh") {
  $ghVer = (gh --version 2>$null | Select-Object -First 1) -replace 'gh version ', ''
  Write-Ok "GitHub CLI $ghVer"
} else {
  Write-Warn "GitHub CLI not found"
  if (-not $CheckOnly) {
    $null = Install-Via-Winget "GitHub.cli" "GitHub CLI"
    # winget sometimes needs explicit PATH addition
    $ghPath = "C:\Program Files\GitHub CLI"
    if (Test-Path $ghPath) { $env:Path += ";$ghPath" }
    Refresh-Path
    if (Test-Command "gh") { Write-Ok "GitHub CLI installed" } else { Write-Fail "GitHub CLI install failed"; $allGood = $false }
  } else { $allGood = $false }
}

# -- Azure CLI --
if (Test-Command "az") {
  $azVer = (az version --query '"azure-cli"' -o tsv 2>$null)
  Write-Ok "Azure CLI $azVer"
} else {
  Write-Warn "Azure CLI not found"
  if (-not $CheckOnly) {
    $null = Install-Via-Winget "Microsoft.AzureCLI" "Azure CLI"
    Refresh-Path
    if (Test-Command "az") { Write-Ok "Azure CLI installed" } else { Write-Fail "Azure CLI install failed"; $allGood = $false }
  } else { $allGood = $false }
}

# -- Copilot extension (filesystem check — no Code.exe launch) --
if ($codeCmd) {
  if (Test-CodeExtension "github.copilot-chat" $codeCmd) {
    Write-Ok "GitHub Copilot Chat extension installed"
  } else {
    Write-Warn "GitHub Copilot Chat extension not found"
    if (-not $CheckOnly) {
      Write-Host "  Installing Copilot Chat extension..." -ForegroundColor Gray
      # --install-extension is the one CLI call we can't avoid — it needs Code.exe
      & $codeCmd --install-extension GitHub.copilot-chat --force 2>$null | Out-Null
      Write-Ok "Copilot Chat extension installed"
    } else { $allGood = $false }
  }
}

if ($CheckOnly) {
  Write-Step "Check complete"
  if ($allGood) { Write-Ok "All prerequisites satisfied" } else { Write-Fail "Some prerequisites missing — run without -CheckOnly to install" }
  exit $(if ($allGood) { 0 } else { 1 })
}

# ── Step 2: Clone the Repo ───────────────────────────────────────────
if (-not $SkipClone) {
  Write-Step "Cloning MCAPS IQ"
  if (Test-Path (Join-Path $CloneDir ".git")) {
    Write-Ok "Repo already exists at $CloneDir — pulling latest"
    Push-Location $CloneDir
    git pull --ff-only 2>$null
    Pop-Location
  } else {
    if (-not (Test-Path (Split-Path $CloneDir))) {
      New-Item -ItemType Directory -Path (Split-Path $CloneDir) -Force | Out-Null
    }
    git clone https://github.com/Microsoft/MCAPS-IQ.git $CloneDir
    Write-Ok "Cloned to $CloneDir"
  }
  Set-Location $CloneDir
} else {
  Write-Ok "Skipping clone (using current directory)"
}

# ── Step 3: Authenticate ─────────────────────────────────────────────
if (-not $SkipAuth) {
  Write-Step "Authenticating"

  # GitHub Packages auth
  Write-Host "  Setting up GitHub Packages access..." -ForegroundColor Gray
  try {
    & node scripts/github-packages-auth.js
    Write-Ok "GitHub Packages auth configured"
  } catch {
    Write-Warn "GitHub Packages auth failed — you can retry later: npm run auth:packages"
  }

  # Azure sign-in
  $azAccount = az account show --query user.name -o tsv 2>$null
  if ($azAccount) {
    Write-Ok "Already signed in to Azure as $azAccount"
  } else {
    Write-Host "  Signing in to Azure (Microsoft tenant)..." -ForegroundColor Gray
    az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
    $azAccount = az account show --query user.name -o tsv 2>$null
    if ($azAccount) { Write-Ok "Signed in as $azAccount" } else { Write-Warn "Azure sign-in may have failed — retry: az login" }
  }
} else {
  Write-Ok "Skipping auth steps"
}

# ── Step 4: Obsidian (optional) ──────────────────────────────────────
$obsidianInstalled = (Test-Command "obsidian") -or
                     (Test-Path "$env:LOCALAPPDATA\Obsidian\Obsidian.exe") -or
                     (Test-Path "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe") -or
                     (Test-Winget-Installed "Obsidian.Obsidian")

if ($obsidianInstalled) {
  Write-Ok "Obsidian already installed"
  if (Test-Path "scripts\setup-vault.js") {
    if (-not $NoObsidian) {
      Write-Step "Scaffolding Obsidian vault"
      & node scripts/setup-vault.js --check 2>$null
    } else {
      Write-Ok "Skipping vault scaffold"
    }
  }
} else {
  $installObsidian = $false
  if ($WithObsidian) {
    $installObsidian = $true
  } elseif ($NoObsidian) {
    Write-Ok "Skipping Obsidian setup"
  } else {
    # Interactive prompt
    Write-Host ""
    Write-Host "  Obsidian provides persistent memory for the agent (meeting history," -ForegroundColor Cyan
    Write-Host "  customer context, relationship maps). Recommended but optional." -ForegroundColor Cyan
    Write-Host ""
    $answer = Read-Host "  Install Obsidian? [y/N]"
    if ($answer -match '^[yY]') {
      $installObsidian = $true
    } else {
      Write-Ok "Skipping Obsidian — you can install later: https://obsidian.md"
    }
  }

  if ($installObsidian) {
    Write-Step "Installing Obsidian"
    $null = Install-Via-Winget "Obsidian.Obsidian" "Obsidian"
    Refresh-Path
    $obsidianNow = (Test-Command "obsidian") -or
                   (Test-Path "$env:LOCALAPPDATA\Obsidian\Obsidian.exe") -or
                   (Test-Path "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe") -or
                   (Test-Winget-Installed "Obsidian.Obsidian")
    if ($obsidianNow) {
      Write-Ok "Obsidian installed"
    } else {
      Write-Warn "Obsidian install may have failed — download from https://obsidian.md"
    }
    if (Test-Path "scripts\setup-vault.js") {
      Write-Step "Scaffolding Obsidian vault"
      & node scripts/setup-vault.js --check 2>$null
    }
  }
}

# ── Step 4b: Configure Obsidian vault path ────────────────────────────
# Check if vault is already configured — match setup-vault.js resolution order:
#   1. Live env vars (set by setup-vault-env.js in the shell profile)
#   2. .env file in the repo root
$existingVault = $null
if ($env:OBSIDIAN_VAULT)      { $existingVault = $env:OBSIDIAN_VAULT }
elseif ($env:OBSIDIAN_VAULT_PATH) { $existingVault = $env:OBSIDIAN_VAULT_PATH }
if (-not $existingVault -and (Test-Path ".env")) {
  foreach ($line in (Get-Content ".env" -ErrorAction SilentlyContinue)) {
    if ($line -match '^\s*OBSIDIAN_VAULT_PATH\s*=\s*(.+)') {
      $existingVault = $Matches[1].Trim().Trim('"', "'")
      break
    }
  }
}

if ($existingVault) {
  Write-Ok "Obsidian vault already configured: $existingVault"
} elseif (-not $NoObsidian) {
  Write-Step "Configuring Obsidian vault location"
  Write-Host ""
  Write-Host "  The agent uses an Obsidian vault for persistent memory." -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  If you already have an Obsidian vault, paste its full path below." -ForegroundColor White
  Write-Host "  If you don't know what this is, just press Enter — a local vault" -ForegroundColor Yellow
  Write-Host "  will be created at .vault\ inside this repo (already gitignored)." -ForegroundColor Yellow
  Write-Host ""
  $vaultInput = Read-Host "  Vault path (press Enter for default)"

  if ([string]::IsNullOrWhiteSpace($vaultInput)) {
    $vaultPath = Join-Path (Get-Location) ".vault"
  } else {
    # Expand ~ to home directory
    if ($vaultInput.StartsWith("~")) {
      $vaultInput = $vaultInput -replace '^~', $HOME
    }
    $vaultPath = [System.IO.Path]::GetFullPath($vaultInput)
  }

  # Create the vault directory if it doesn't exist
  if (-not (Test-Path $vaultPath)) {
    New-Item -ItemType Directory -Path $vaultPath -Force | Out-Null
    Write-Ok "Created vault directory: $vaultPath"
  }

  # Write to .env (create or append)
  if (Test-Path ".env") {
    Add-Content -Path ".env" -Value "`nOBSIDIAN_VAULT_PATH=$vaultPath"
  } else {
    Set-Content -Path ".env" -Value "# -- Obsidian Vault --`nOBSIDIAN_VAULT_PATH=$vaultPath"
  }
  Write-Ok "Vault path saved to .env: $vaultPath"

  # Scaffold the vault structure
  if (Test-Path "scripts\setup-vault.js") {
    & node scripts/setup-vault.js $vaultPath 2>$null
    Write-Ok "Vault structure initialized"
  }

  # Persist to shell profile so it's available everywhere
  if (Test-Path "scripts\setup-vault-env.js") {
    & node scripts/setup-vault-env.js $vaultPath 2>$null
  }
}

# ── Step 5: Install dependencies & mcaps CLI ─────────────────────────
Write-Step "Installing dependencies and mcaps CLI"
try {
  & npm install 2>$null
  & npm link 2>$null
  Write-Ok "mcaps CLI installed globally — run 'mcaps' from anywhere"
} catch {
  Write-Warn "npm install/link failed — you can still use VS Code normally"
}

# ── Step 5b: Agency CLI (optional) ───────────────────────────────────
if (Test-Command "agency") {
  Write-Ok "Agency CLI already installed"
} else {
  Write-Host ""
  Write-Host "  Agency CLI provides additional MCP server management capabilities." -ForegroundColor Cyan
  Write-Host "  Recommended for the full agent experience." -ForegroundColor Cyan
  Write-Host ""
  $agencyAnswer = Read-Host "  Install Agency CLI? [Y/n]"
  if ($agencyAnswer -match '^[nN]') {
    Write-Ok "Skipping Agency CLI — install later:"
    Write-Warn '  iex "& { $(irm aka.ms/InstallTool.ps1)} agency"'
  } else {
    Write-Step "Installing Agency CLI"
    try {
      $psExe = if (Test-Command "pwsh") { "pwsh" } else { "powershell.exe" }
      $psScript = @(
        '$ErrorActionPreference = "Stop"'
        '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12'
        'iex "& { $(irm aka.ms/InstallTool.ps1)} agency"'
      ) -join "; "

      $maxAttempts = 3
      $agencyInstalled = $false
      $childExitCode = $null

      for ($attempt = 1; $attempt -le $maxAttempts -and -not $agencyInstalled; $attempt++) {
        Write-Host "  Install attempt $attempt/$maxAttempts..." -ForegroundColor DarkGray
        & $psExe -NoProfile -ExecutionPolicy Bypass -Command $psScript
        $childExitCode = $LASTEXITCODE

        Refresh-Path
        $agencyInstalled = Test-Command "agency"

        if (-not $agencyInstalled -and $attempt -lt $maxAttempts) {
          Write-Warn "Agency CLI not detected after attempt $attempt. Retrying in 3s..."
          Start-Sleep -Seconds 3
        }
      }

      if ($agencyInstalled) {
        Write-Ok "Agency CLI installed"
      } elseif ($null -ne $childExitCode -and $childExitCode -ne 0) {
        Write-Warn "Agency CLI install failed after $maxAttempts attempts (exit code $childExitCode)."
        Write-Warn '  Retry manually: iex "& { $(irm aka.ms/InstallTool.ps1)} agency"'
        Write-Warn "  Details: https://aka.ms/agency"
      } else {
        Write-Warn "Agency installer ran, but 'agency' is not yet available in this shell."
        Write-Warn "  Open a new terminal, then run: agency --version"
      }
    } catch {
      Write-Warn "Agency CLI install failed — retry later:"
      Write-Warn '  iex "& { $(irm aka.ms/InstallTool.ps1)} agency"'
      Write-Warn "  Details: https://aka.ms/agency"
    }
  }
}

# ── Step 6: Open VS Code ─────────────────────────────────────────────
Write-Step "Setup complete!"

# Adjust next-steps guidance based on whether we'll auto-open
$alreadyInCode = $env:TERM_PROGRAM -eq "vscode"

if ($alreadyInCode) {
  Write-Host @"

  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   MCAPS IQ is ready!                                        │
  │                                                             │
  │   You're already in VS Code — no extra window needed.       │
  │                                                             │
  │   Next steps:                                               │
  │     1. Open .vscode/mcp.json and click 'Start' on msx       │
  │     2. Open Copilot Chat (Ctrl+Shift+I)                     │
  │     3. Try: "Who am I in MSX?"                              │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘

"@ -ForegroundColor Green
} else {
  Write-Host @"

  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   MCAPS IQ is ready!                                        │
  │                                                             │
  │   Next steps:                                               │
  │     1. VS Code will open with the workspace                 │
  │     2. Open .vscode/mcp.json and click 'Start' on msx      │
  │     3. Open Copilot Chat (Ctrl+Shift+I)                     │
  │     4. Try: "Who am I in MSX?"                              │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘

"@ -ForegroundColor Green

  # Open VS Code with the workspace (uses cached $codeCmd from prereq check)
  if ($codeCmd) {
    & $codeCmd . 2>$null
  } else {
    Write-Warn "VS Code not on PATH — open the workspace manually"
  }
}
