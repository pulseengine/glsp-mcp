# Pre-commit Hooks for GLSP-Rust

This project uses [pre-commit](https://pre-commit.com/) to ensure code quality and consistency across both the Rust backend and TypeScript frontend.

## Quick Setup

```bash
# Run the setup script
./setup-pre-commit.sh
```

## Manual Setup

1. **Install pre-commit:**
   ```bash
   pip install pre-commit
   # or
   brew install pre-commit
   ```

2. **Install hooks:**
   ```bash
   pre-commit install
   pre-commit install --hook-type commit-msg
   ```

3. **Run on all files (first time):**
   ```bash
   pre-commit run --all-files
   ```

## Configured Hooks

### Code Quality
- **Trailing whitespace removal**
- **End-of-file fixer**
- **Large file detection** (>1MB)
- **YAML/TOML/JSON validation**
- **Merge conflict detection**

### Rust (Backend)
- **rustfmt**: Code formatting
- **clippy**: Linting with warnings as errors
- **cargo test**: Unit and integration tests

### TypeScript (Frontend)
- **ESLint**: Code linting with auto-fix
- **Prettier**: Code formatting
- **tsc**: Type checking (no emit)
- **Tests**: Frontend test suite (when configured)

### Security
- **detect-secrets**: Prevents commits containing secrets
- **Conventional commits**: Enforces commit message format

## Usage

### Automatic (Recommended)
Hooks run automatically on every commit. If any hook fails, the commit is rejected.

### Manual
```bash
# Run all hooks on staged files
pre-commit run

# Run all hooks on all files
pre-commit run --all-files

# Run specific hook
pre-commit run rust-test

# Update hook versions
pre-commit autoupdate
```

### Skip Hooks (Emergency Only)
```bash
git commit --no-verify -m "emergency fix"
```

## Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or modifying tests
- `chore`: Build process or auxiliary tool changes

**Examples:**
```
feat(backend): add WASM component scanning
fix(frontend): resolve circular reference in UIManager
docs: update pre-commit setup instructions
chore: add pre-commit hooks for code quality
```

## CI Integration

Pre-commit hooks also run in GitHub Actions:
- `.github/workflows/pre-commit.yml`
- Runs on push and pull requests
- Includes additional security audits

## Troubleshooting

### Hook Failures
1. **Rust formatting**: Run `cargo fmt` in `glsp-mcp-server/`
2. **Rust clippy**: Fix warnings with `cargo clippy --fix` in `glsp-mcp-server/`
3. **TypeScript errors**: Fix with `npm run lint --fix` in `glsp-web-client/`
4. **Type errors**: Fix TypeScript types, check with `npm run type-check`

### Performance
- First run may be slow (downloads and installs tools)
- Subsequent runs are fast (tools are cached)
- Use `pre-commit run --files <specific-files>` for targeted checks

### Skipping Specific Hooks
Add to `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: local
    hooks:
      - id: problematic-hook
        skip: true
```

## Configuration Files

- `.pre-commit-config.yaml`: Main configuration
- `.secrets.baseline`: Security scanning baseline
- `LICENSE_HEADER.txt`: License header template
- `glsp-web-client/.eslintrc.json`: ESLint configuration
- `glsp-web-client/tsconfig.json`: TypeScript configuration

## Benefits

1. **Consistency**: Uniform code style across the team
2. **Quality**: Catches issues before they reach CI/CD
3. **Security**: Prevents accidental secret commits
4. **Efficiency**: Faster feedback loop than CI-only checks
5. **Standards**: Enforces conventional commit messages

## Maintenance

- **Update hooks**: Run `pre-commit autoupdate` quarterly
- **Review config**: Update `.pre-commit-config.yaml` as project needs evolve
- **Monitor CI**: Ensure GitHub Actions workflow stays in sync

## Integration with IDEs

### VSCode
Install extensions:
- Rust Analyzer
- ESLint
- Prettier
- GitLens

### Other IDEs
Configure to use:
- `rustfmt` for Rust formatting
- ESLint for TypeScript linting
- Prettier for code formatting