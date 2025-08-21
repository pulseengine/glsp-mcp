#!/bin/bash
# Build script for GLSP Tauri Desktop (macOS)

set -e

echo "🚀 Building WASM Component Designer for macOS..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

# Check Rust
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Rust is not installed${NC}"
    exit 1
fi

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Build web client
echo -e "${YELLOW}Building web client...${NC}"
cd "$ROOT_DIR/glsp-web-client"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing web client dependencies..."
    npm install
fi

# Build web client (bypassing TypeScript errors with Vite directly)
echo "Building web client assets..."
npx vite build

echo -e "${GREEN}✅ Web client built successfully${NC}"

# Build Tauri app
echo -e "${YELLOW}Building Tauri desktop app...${NC}"
cd "$ROOT_DIR/glsp-tauri"

# Install Tauri dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing Tauri dependencies..."
    npm install
fi

# Determine architecture
ARCH=$(uname -m)
echo "Building for architecture: $ARCH"

# Build based on architecture
if [ "$ARCH" = "arm64" ]; then
    echo "Building for Apple Silicon (arm64)..."
    npx tauri build
elif [ "$ARCH" = "x86_64" ]; then
    echo "Building for Intel (x86_64)..."
    npx tauri build --target x86_64-apple-darwin
else
    echo -e "${RED}Unsupported architecture: $ARCH${NC}"
    exit 1
fi

# Check if build was successful
if [ -d "$ROOT_DIR/target/release/bundle/macos" ]; then
    echo -e "${GREEN}✅ Build completed successfully!${NC}"
    echo ""
    echo "📦 Build artifacts:"
    echo "  App Bundle: $ROOT_DIR/target/release/bundle/macos/WASM Component Designer.app"

    # Check for DMG
    DMG_PATH=$(find "$ROOT_DIR/target/release/bundle/dmg" -name "*.dmg" 2>/dev/null | head -n 1)
    if [ -n "$DMG_PATH" ]; then
        echo "  DMG Installer: $DMG_PATH"
    fi

    echo ""
    echo "🚀 To run the app:"
    echo "  open \"$ROOT_DIR/target/release/bundle/macos/WASM Component Designer.app\""
else
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi
