#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# MCAPS IQ Bootstrap — macOS / Linux
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/Microsoft/MCAPS-IQ/main/scripts/bootstrap.sh | bash
#
# Or run locally after cloning:
#   ./scripts/bootstrap.sh
#
# Flags:
#   --skip-clone   Skip git clone (use when already in the repo)
#   --skip-auth    Skip Azure + GitHub auth steps
#   --check-only   Only verify prerequisites, don't install anything
#   --clone-dir    Where to clone (default: ~/mcaps-iq)
#   --with-obsidian  Install Obsidian + scaffold vault (skips prompt)
#   --no-obsidian   Skip Obsidian setup entirely (skips prompt)
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Parse flags ──────────────────────────────────────────────────────
SKIP_CLONE=false
SKIP_AUTH=false
CHECK_ONLY=false
CLONE_DIR="$HOME/mcaps-iq"
OBSIDIAN_OPT=""  # empty = ask, "yes" = install, "no" = skip

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-clone)    SKIP_CLONE=true; shift ;;
    --skip-auth)     SKIP_AUTH=true; shift ;;
    --check-only)    CHECK_ONLY=true; shift ;;
    --clone-dir)     CLONE_DIR="$2"; shift 2 ;;
    --with-obsidian) OBSIDIAN_OPT="yes"; shift ;;
    --no-obsidian)   OBSIDIAN_OPT="no"; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────
step()  { printf '\n\033[36m━━━ %s ━━━\033[0m\n' "$1"; }
ok()    { printf '  \033[32m✔ %s\033[0m\n' "$1"; }
warn()  { printf '  \033[33m⚠ %s\033[0m\n' "$1"; }
fail()  { printf '  \033[31m✖ %s\033[0m\n' "$1"; }

has_cmd() { command -v "$1" &>/dev/null; }

has_brew() { has_cmd brew; }

# Resolve VS Code CLI — prefer code-insiders over stable
resolve_code_cmd() {
  if has_cmd code; then echo "code";
  elif has_cmd code-insiders; then echo "code-insiders";
  else echo ""; fi
}

install_brew_pkg() {
  local formula="$1" label="$2"
  if has_brew; then
    echo "  Installing $label via Homebrew..."
    brew install "$formula" 2>/dev/null || brew upgrade "$formula" 2>/dev/null || true
  else
    fail "Homebrew not found — install $label manually"
    return 1
  fi
}

# ── Step 1: Check / Install Prerequisites ────────────────────────────
ALL_GOOD=true

step "Checking prerequisites"

# -- Homebrew (macOS only) --
if [[ "$(uname)" == "Darwin" ]] && ! has_brew; then
  warn "Homebrew not found"
  if [[ "$CHECK_ONLY" == "false" ]]; then
    echo "  Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add brew to PATH for Apple Silicon
    if [[ -f /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    if has_brew; then ok "Homebrew installed"; else fail "Homebrew install failed"; ALL_GOOD=false; fi
  else
    ALL_GOOD=false
  fi
fi

# -- Git --
if has_cmd git; then
  ok "$(git --version)"
else
  warn "Git not found"
  if [[ "$CHECK_ONLY" == "false" ]]; then
    if [[ "$(uname)" == "Darwin" ]]; then
      # xcode-select may prompt a GUI dialog — try brew first
      install_brew_pkg git "Git" || xcode-select --install 2>/dev/null || true
    else
      sudo apt-get update -qq && sudo apt-get install -y -qq git 2>/dev/null || true
    fi
    if has_cmd git; then ok "Git installed"; else fail "Git install failed"; ALL_GOOD=false; fi
  else
    ALL_GOOD=false
  fi
fi

# -- Node.js --
if has_cmd node; then
  NODE_VER="$(node --version)"
  NODE_MAJOR="${NODE_VER#v}"
  NODE_MAJOR="${NODE_MAJOR%%.*}"
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    ok "Node.js $NODE_VER"
  else
    warn "Node.js $NODE_VER found — need v18+"
    if [[ "$CHECK_ONLY" == "false" ]]; then
      install_brew_pkg node "Node.js" || true
    else
      ALL_GOOD=false
    fi
  fi
else
  warn "Node.js not found"
  if [[ "$CHECK_ONLY" == "false" ]]; then
    if [[ "$(uname)" == "Darwin" ]]; then
      install_brew_pkg node "Node.js"
    else
      # Use NodeSource for Linux
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
      sudo apt-get install -y -qq nodejs 2>/dev/null || true
    fi
    if has_cmd node; then ok "Node.js $(node --version) installed"; else fail "Node.js install failed"; ALL_GOOD=false; fi
  else
    ALL_GOOD=false
  fi
fi

# -- GitHub CLI --
if has_cmd gh; then
  GH_VER="$(gh --version | head -1 | sed 's/gh version //')"
  ok "GitHub CLI $GH_VER"
else
  warn "GitHub CLI not found"
  if [[ "$CHECK_ONLY" == "false" ]]; then
    if [[ "$(uname)" == "Darwin" ]]; then
      install_brew_pkg gh "GitHub CLI"
    else
      # Official Linux install
      (type -p wget >/dev/null || (sudo apt update && sudo apt-get install wget -y)) \
        && sudo mkdir -p -m 755 /etc/apt/keyrings \
        && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
        && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
        && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
        && sudo apt update -qq \
        && sudo apt install gh -y -qq 2>/dev/null || true
    fi
    if has_cmd gh; then ok "GitHub CLI installed"; else fail "GitHub CLI install failed"; ALL_GOOD=false; fi
  else
    ALL_GOOD=false
  fi
fi

# -- Azure CLI --
if has_cmd az; then
  AZ_VER="$(az version --query '"azure-cli"' -o tsv 2>/dev/null)"
  ok "Azure CLI $AZ_VER"
else
  warn "Azure CLI not found"
  if [[ "$CHECK_ONLY" == "false" ]]; then
    if [[ "$(uname)" == "Darwin" ]]; then
      install_brew_pkg azure-cli "Azure CLI"
    else
      curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash 2>/dev/null || true
    fi
    if has_cmd az; then ok "Azure CLI installed"; else fail "Azure CLI install failed"; ALL_GOOD=false; fi
  else
    ALL_GOOD=false
  fi
fi

# -- VS Code (stable or Insiders) --
CODE_CMD="$(resolve_code_cmd)"
if [[ -n "$CODE_CMD" ]]; then
  CODE_VER="$($CODE_CMD --version 2>/dev/null | head -1)"
  CODE_LABEL="VS Code"; [[ "$CODE_CMD" == "code-insiders" ]] && CODE_LABEL="VS Code Insiders"
  ok "$CODE_LABEL $CODE_VER"
else
  warn "VS Code not found"
  if [[ "$CHECK_ONLY" == "false" ]]; then
    if [[ "$(uname)" == "Darwin" ]]; then
      install_brew_pkg --cask visual-studio-code "VS Code" 2>/dev/null || install_brew_pkg visual-studio-code "VS Code" || true
    else
      # Snap or direct install for Linux
      sudo snap install code --classic 2>/dev/null || true
    fi
    CODE_CMD="$(resolve_code_cmd)"
    if [[ -n "$CODE_CMD" ]]; then ok "VS Code installed"; else fail "VS Code install failed"; ALL_GOOD=false; fi
  else
    ALL_GOOD=false
  fi
fi

# -- Copilot extension --
if [[ -n "$CODE_CMD" ]]; then
  if $CODE_CMD --list-extensions 2>/dev/null | grep -qi "github.copilot-chat"; then
    ok "GitHub Copilot Chat extension installed"
  else
    warn "GitHub Copilot Chat extension not found"
    if [[ "$CHECK_ONLY" == "false" ]]; then
      $CODE_CMD --install-extension GitHub.copilot-chat 2>/dev/null || true
      ok "Copilot Chat extension installed"
    else
      ALL_GOOD=false
    fi
  fi
fi

if [[ "$CHECK_ONLY" == "true" ]]; then
  step "Check complete"
  if [[ "$ALL_GOOD" == "true" ]]; then ok "All prerequisites satisfied"; exit 0; else fail "Some prerequisites missing — run without --check-only to install"; exit 1; fi
fi

# ── Step 2: Clone the Repo ───────────────────────────────────────────
if [[ "$SKIP_CLONE" == "false" ]]; then
  step "Cloning MCAPS IQ"
  if [[ -d "$CLONE_DIR/.git" ]]; then
    ok "Repo already exists at $CLONE_DIR — pulling latest"
    pushd "$CLONE_DIR" >/dev/null
    git pull --ff-only 2>/dev/null || true
    popd >/dev/null
  else
    mkdir -p "$(dirname "$CLONE_DIR")"
    git clone https://github.com/Microsoft/MCAPS-IQ.git "$CLONE_DIR"
    ok "Cloned to $CLONE_DIR"
  fi
  cd "$CLONE_DIR"
else
  ok "Skipping clone (using current directory)"
fi

# ── Step 3: Authenticate ─────────────────────────────────────────────
if [[ "$SKIP_AUTH" == "false" ]]; then
  step "Authenticating"

  # GitHub Packages auth
  echo "  Setting up GitHub Packages access..."
  if node scripts/github-packages-auth.js 2>/dev/null; then
    ok "GitHub Packages auth configured"
  else
    warn "GitHub Packages auth failed — retry later: npm run auth:packages"
  fi

  # Azure sign-in
  AZ_ACCOUNT="$(az account show --query user.name -o tsv 2>/dev/null || true)"
  if [[ -n "$AZ_ACCOUNT" ]]; then
    ok "Already signed in to Azure as $AZ_ACCOUNT"
  else
    echo "  Signing in to Azure (Microsoft tenant)..."
    az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47 || true
    AZ_ACCOUNT="$(az account show --query user.name -o tsv 2>/dev/null || true)"
    if [[ -n "$AZ_ACCOUNT" ]]; then ok "Signed in as $AZ_ACCOUNT"; else warn "Azure sign-in may have failed — retry: az login"; fi
  fi
else
  ok "Skipping auth steps"
fi

# ── Step 4: Obsidian (optional) ───────────────────────────────────────
OBSIDIAN_INSTALLED=false
if has_cmd obsidian || [[ -d "/Applications/Obsidian.app" ]] || [[ -d "$HOME/Applications/Obsidian.app" ]]; then
  OBSIDIAN_INSTALLED=true
fi

if [[ "$OBSIDIAN_INSTALLED" == "true" ]]; then
  ok "Obsidian already installed"
  # Scaffold vault if repo is available
  if [[ -f "scripts/setup-vault.js" ]]; then
    if [[ "$OBSIDIAN_OPT" == "no" ]]; then
      ok "Skipping vault scaffold"
    else
      step "Scaffolding Obsidian vault"
      node scripts/setup-vault.js --check 2>/dev/null || true
    fi
  fi
else
  # Determine whether to install
  INSTALL_OBSIDIAN=false
  if [[ "$OBSIDIAN_OPT" == "yes" ]]; then
    INSTALL_OBSIDIAN=true
  elif [[ "$OBSIDIAN_OPT" == "no" ]]; then
    ok "Skipping Obsidian setup"
  else
    # Interactive prompt
    printf '\n'
    printf '  \033[36mObsidian provides persistent memory for the agent (meeting history,\033[0m\n'
    printf '  \033[36mcustomer context, relationship maps). Recommended but optional.\033[0m\n'
    printf '\n'
    printf '  Install Obsidian? [y/N] '
    read -r OBSIDIAN_ANSWER </dev/tty || OBSIDIAN_ANSWER="n"
    case "$OBSIDIAN_ANSWER" in
      [yY]|[yY][eE][sS]) INSTALL_OBSIDIAN=true ;;
      *) ok "Skipping Obsidian — you can install later: https://obsidian.md" ;;
    esac
  fi

  if [[ "$INSTALL_OBSIDIAN" == "true" ]]; then
    step "Installing Obsidian"
    if [[ "$(uname)" == "Darwin" ]]; then
      if has_brew; then
        echo "  Installing Obsidian via Homebrew..."
        brew install --cask obsidian 2>/dev/null || true
      else
        fail "Homebrew not found — install Obsidian manually from https://obsidian.md"
      fi
    else
      # Linux — try snap, then flatpak
      if has_cmd snap; then
        sudo snap install obsidian --classic 2>/dev/null || true
      elif has_cmd flatpak; then
        flatpak install -y flathub md.obsidian.Obsidian 2>/dev/null || true
      else
        warn "Could not auto-install Obsidian on Linux — download from https://obsidian.md"
      fi
    fi

    if has_cmd obsidian || [[ -d "/Applications/Obsidian.app" ]] || [[ -d "$HOME/Applications/Obsidian.app" ]]; then
      ok "Obsidian installed"
    else
      warn "Obsidian install may have failed — download from https://obsidian.md"
    fi

    # Scaffold vault
    if [[ -f "scripts/setup-vault.js" ]]; then
      step "Scaffolding Obsidian vault"
      node scripts/setup-vault.js --check 2>/dev/null || true
    fi
  fi
fi

# ── Step 4b: Configure Obsidian vault path ────────────────────────────
# Check if .env already has OBSIDIAN_VAULT_PATH configured
EXISTING_VAULT=""
if [[ -f ".env" ]]; then
  EXISTING_VAULT="$(grep -E '^OBSIDIAN_VAULT_PATH=' .env 2>/dev/null | head -1 | sed 's/^OBSIDIAN_VAULT_PATH=//' | sed 's/^["'"'"']//;s/["'"'"']$//')"
fi

if [[ -n "$EXISTING_VAULT" ]]; then
  ok "Obsidian vault already configured: $EXISTING_VAULT"
elif [[ "$OBSIDIAN_OPT" != "no" ]]; then
  step "Configuring Obsidian vault location"
  printf '\n'
  printf '  \033[36mThe agent uses an Obsidian vault for persistent memory.\033[0m\n'
  printf '\n'
  printf '  If you already have an Obsidian vault, paste its full path below.\n'
  printf '  \033[33mIf you don'\''t know what this is, just press Enter — a local vault\033[0m\n'
  printf '  \033[33mwill be created at .vault/ inside this repo (already gitignored).\033[0m\n'
  printf '\n'
  printf '  Vault path (press Enter for default): '
  read -r VAULT_INPUT </dev/tty || VAULT_INPUT=""

  if [[ -z "$VAULT_INPUT" ]]; then
    VAULT_PATH="$(pwd)/.vault"
  else
    # Expand ~ to home directory
    VAULT_PATH="${VAULT_INPUT/#\~/$HOME}"
    # Resolve to absolute path
    VAULT_PATH="$(cd "$(dirname "$VAULT_PATH")" 2>/dev/null && pwd)/$(basename "$VAULT_PATH")" 2>/dev/null || VAULT_PATH="$VAULT_INPUT"
  fi

  # Create the vault directory if it doesn't exist
  if [[ ! -d "$VAULT_PATH" ]]; then
    mkdir -p "$VAULT_PATH"
    ok "Created vault directory: $VAULT_PATH"
  fi

  # Write to .env (create or append)
  if [[ -f ".env" ]]; then
    printf '\nOBSIDIAN_VAULT_PATH=%s\n' "$VAULT_PATH" >> .env
  else
    printf '# ── Obsidian Vault ──────────────────────────────────────────────\nOBSIDIAN_VAULT_PATH=%s\n' "$VAULT_PATH" > .env
  fi
  ok "Vault path saved to .env: $VAULT_PATH"

  # Scaffold the vault structure
  if [[ -f "scripts/setup-vault.js" ]]; then
    node scripts/setup-vault.js "$VAULT_PATH" 2>/dev/null || true
    ok "Vault structure initialized"
  fi

  # Persist to shell profile so it's available everywhere
  if [[ -f "scripts/setup-vault-env.js" ]]; then
    node scripts/setup-vault-env.js "$VAULT_PATH" 2>/dev/null || true
  fi
fi

# ── Step 5: Install dependencies & mcaps CLI ─────────────────────────
step "Installing dependencies and mcaps CLI"
npm install 2>/dev/null
if has_cmd npx; then
  if npm link 2>/dev/null; then
    ok "mcaps CLI installed globally — run 'mcaps' from anywhere"
  else
    warn "npm link failed — you can still use VS Code normally"
  fi
else
  warn "npm/npx not available — skipping mcaps CLI install"
fi

# ── Step 5b: Agency CLI (optional) ───────────────────────────────────
if has_cmd agency; then
  ok "Agency CLI already installed"
else
  printf '\n'
  printf '  \033[36mAgency CLI provides additional MCP server management capabilities.\033[0m\n'
  printf '  \033[36mRecommended for the full agent experience.\033[0m\n'
  printf '\n'
  printf '  Install Agency CLI? [Y/n] '
  read -r AGENCY_ANSWER </dev/tty || AGENCY_ANSWER="y"
  case "$AGENCY_ANSWER" in
    [nN]|[nN][oO]) ok "Skipping Agency CLI — install later: curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency" ;;
    *)
      step "Installing Agency CLI"
      if curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency 2>/dev/null; then
        # Refresh PATH
        export PATH="$HOME/.local/bin:$PATH"
        if has_cmd agency; then
          ok "Agency CLI installed"
        else
          warn "Agency CLI install completed — restart your terminal to use it"
        fi
      else
        warn "Agency CLI install failed — retry later: curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency"
        warn "Details: https://aka.ms/agency"
      fi
      ;;
  esac
fi

# ── Step 6: Open VS Code ─────────────────────────────────────────────
step "Setup complete!"

printf '\n'
printf '  \033[32m┌─────────────────────────────────────────────────────────────┐\033[0m\n'
printf '  \033[32m│                                                             │\033[0m\n'
printf '  \033[32m│   MCAPS IQ is ready!                                        │\033[0m\n'
printf '  \033[32m│                                                             │\033[0m\n'
printf '  \033[32m│   Next steps:                                               │\033[0m\n'
printf '  \033[32m│     1. VS Code will open with the workspace                 │\033[0m\n'
printf '  \033[32m│     2. Open .vscode/mcp.json and click "Start" on msx       │\033[0m\n'
printf '  \033[32m│     3. Open Copilot Chat (Cmd+Shift+I)                      │\033[0m\n'
printf '  \033[32m│     4. Try: "Who am I in MSX?"                              │\033[0m\n'
printf '  \033[32m│                                                             │\033[0m\n'
printf '  \033[32m└─────────────────────────────────────────────────────────────┘\033[0m\n'
printf '\n'

CODE_CMD="$(resolve_code_cmd)"
if [[ -n "$CODE_CMD" ]]; then
  $CODE_CMD .
else
  warn "VS Code not on PATH — open the workspace manually"
fi
