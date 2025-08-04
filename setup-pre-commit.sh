#!/bin/bash
set -e

echo "🔧 Setting up pre-commit hooks for GLSP-Rust..."

# Check if pre-commit is installed
if ! command -v pre-commit &> /dev/null; then
    echo "Installing pre-commit..."
    if command -v pip &> /dev/null; then
        pip install pre-commit
    elif command -v pipx &> /dev/null; then
        pipx install pre-commit
    elif command -v brew &> /dev/null; then
        brew install pre-commit
    else
        echo "❌ Could not install pre-commit. Please install it manually:"
        echo "   pip install pre-commit"
        echo "   or visit: https://pre-commit.com/#installation"
        exit 1
    fi
fi

# Install the pre-commit hooks
echo "Installing pre-commit hooks..."
pre-commit install

# Install commit-msg hook for conventional commits
echo "Installing commit-msg hook..."
pre-commit install --hook-type commit-msg

# Run pre-commit once to set up the environments
echo "Running pre-commit on all files (this may take a while the first time)..."
pre-commit run --all-files || {
    echo "⚠️  Some pre-commit checks failed. This is normal on first run."
    echo "   Please fix the issues and commit again."
}

echo "✅ Pre-commit hooks successfully set up!"
echo ""
echo "📝 Usage:"
echo "   - Hooks will run automatically on each commit"
echo "   - Run manually: pre-commit run --all-files"
echo "   - Update hooks: pre-commit autoupdate"
echo "   - Skip hooks (not recommended): git commit --no-verify"
echo ""
echo "🎯 Configured checks:"
echo "   ✓ Rust formatting (rustfmt)"
echo "   ✓ Rust linting (clippy)"
echo "   ✓ TypeScript linting (ESLint)"
echo "   ✓ Code formatting (Prettier)"
echo "   ✓ Type checking (tsc)"
echo "   ✓ Tests (Rust + Frontend)"
echo "   ✓ Security scanning (detect-secrets)"
echo "   ✓ Conventional commit messages"
echo "   ✓ File quality checks"
