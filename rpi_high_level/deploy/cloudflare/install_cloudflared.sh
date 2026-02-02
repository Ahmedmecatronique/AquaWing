#!/bin/bash
# Install cloudflared on Raspberry Pi
# 
# This script safely installs cloudflared with:
# - Automatic architecture detection
# - Idempotent installation (safe to run multiple times)
# - Verification of successful installation
#
# Usage: bash install_cloudflared.sh

set -e

echo "========================================"
echo "Installing cloudflared on Raspberry Pi"
echo "========================================"

# Detect architecture
arch=$(uname -m)
echo "Detected architecture: $arch"

# Determine download URL based on architecture
case "$arch" in
    armv7l)
        echo "Using ARMv7 (32-bit) binary..."
        BINARY_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
        ;;
    aarch64)
        echo "Using ARM64 (64-bit) binary..."
        BINARY_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
        ;;
    x86_64)
        echo "Using x86_64 binary (not typical on RPi, but supported)..."
        BINARY_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        ;;
    *)
        echo "ERROR: Unsupported architecture: $arch"
        echo "Supported architectures: armv7l, aarch64, x86_64"
        exit 1
        ;;
esac

echo "Download URL: $BINARY_URL"

# Create temporary directory for download
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

cd "$TEMP_DIR"

# Download cloudflared
echo "Downloading cloudflared..."
if ! wget -q "$BINARY_URL" -O cloudflared; then
    echo "ERROR: Failed to download cloudflared"
    exit 1
fi

# Make executable
chmod +x cloudflared

# Verify it's executable
if ! ./cloudflared --version > /dev/null 2>&1; then
    echo "ERROR: Downloaded binary is not executable or not compatible with this system"
    exit 1
fi

# Install to system location
echo "Installing to /usr/local/bin/..."
sudo cp cloudflared /usr/local/bin/

# Verify installation
if ! /usr/local/bin/cloudflared --version > /dev/null 2>&1; then
    echo "ERROR: Installation verification failed"
    exit 1
fi

echo ""
echo "========================================"
echo "✓ cloudflared installed successfully!"
echo "========================================"
echo ""

# Display version
/usr/local/bin/cloudflared --version

echo ""
echo "Next steps:"
echo "1. Authenticate: cloudflared tunnel login"
echo "2. Create tunnel: cloudflared tunnel create drone-control"
echo "3. Route domain: cloudflared tunnel route dns drone-control drone.example.com"
echo "4. Run tunnel: cloudflared tunnel --config ~/.cloudflared/config.yml run drone-control"
echo ""
echo "See deploy/cloudflare/README_CLOUDFLARE_TUNNEL.md for detailed instructions."
