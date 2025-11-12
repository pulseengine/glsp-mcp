# GLSP-MCP Testing Guide

This document provides comprehensive testing procedures for the GLSP-MCP project without requiring a graphical interface.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Structure](#test-structure)
3. [Running Tests](#running-tests)
4. [Test Categories](#test-categories)
5. [Mock Components](#mock-components)
6. [Non-GUI Testing Strategies](#non-gui-testing-strategies)
7. [Continuous Integration](#continuous-integration)
8. [Troubleshooting](#troubleshooting)

## Quick Start

```bash
# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test file
cargo test --test simple_integration_test

# Run library unit tests only
cargo test --lib

# Run with specific features
cargo test --features postgresql

# Build and test in release mode
cargo test --release
```

## Test Structure

```
glsp-mcp-server/
├── src/
│   ├── lib.rs                          # Library entry point
│   ├── backend.rs                      # Backend implementation
│   ├── database/
│   │   ├── tests.rs                    # Database unit tests
│   │   └── factory_tests.rs            # Factory pattern tests
│   ├── wasm/
│   │   ├── execution_engine.rs         # WASM execution tests
│   │   ├── security_scanner.rs         # Security analysis tests
│   │   ├── wit_analyzer.rs             # WIT interface tests
│   │   └── graphics_renderer.rs        # Graphics rendering tests
│   └── ... (other modules with inline tests)
└── tests/
    ├── mock_wasm_components.rs         # Mock WASM data generators
    └── simple_integration_test.rs      # Integration tests
```

## Running Tests

### All Tests

```bash
# Run everything
cargo test

# Expected output: ~58 tests pass
# - 33 library unit tests
# - 4 mock component tests
# - 16 integration tests
# - 5 doc tests
```

### Specific Test Suites

```bash
# Database tests
cargo test --lib database

# WASM execution tests
cargo test --lib wasm

# Mock component tests
cargo test --test mock_wasm_components

# Integration tests
cargo test --test simple_integration_test

# Documentation tests
cargo test --doc
```

### Filtering Tests

```bash
# Run tests matching a pattern
cargo test diagram

# Run tests with specific name
cargo test test_wasm_magic_number

# Run ignored tests
cargo test -- --ignored

# Run tests in parallel (default) or single-threaded
cargo test -- --test-threads=1
```

## Test Categories

### 1. Unit Tests (33 tests)

Located inline in source modules using `#[cfg(test)]`:

**Database Module** (23 tests)
- Database factory pattern validation
- Configuration parsing and validation
- Feature flag compilation tests
- Backend type conversions
- Sensor data operations
- Data querying with selections

**WASM Module** (9 tests)
- Execution engine initialization
- Security scanner risk analysis
- WIT analyzer basic functionality
- Graphics renderer sanitization
- Resource limit enforcement

**Persistence Module** (1 test)
- Filename sanitization

### 2. Mock Component Tests (4 tests)

Located in `tests/mock_wasm_components.rs`:

- WASM component structure validation
- Diagram JSON schema validation
- WIT interface syntax verification
- Tool argument generation

### 3. Integration Tests (16 tests)

Located in `tests/simple_integration_test.rs`:

- End-to-end workflow scenarios
- WASM magic number validation
- Diagram structure integrity
- Node and edge validation
- WIT interface parsing

### 4. Documentation Tests (5 tests)

Extracted from rustdoc comments:

- API usage examples
- Configuration examples
- Backend initialization patterns

## Mock Components

The `mock_wasm_components` module provides test data without requiring actual WASM binaries:

### Available Mocks

```rust
// Minimal valid WASM module
let wasm = get_mock_wasm_component();

// WASM with a simple function
let wasm_func = get_mock_wasm_with_function();

// Complete diagram structure
let diagram = get_mock_diagram_json();

// WIT interface definition
let wit = get_mock_wit_interface();

// Tool call arguments
let args = get_mock_tool_arguments("create_diagram");

// Validation results
let validation = get_mock_validation_results();
```

### Using Mocks in Tests

```rust
mod mock_wasm_components;
use mock_wasm_components::*;

#[test]
fn my_test() {
    let wasm = get_mock_wasm_component();
    // Test with mock data
    assert!(!wasm.is_empty());
}
```

## Non-GUI Testing Strategies

### 1. Command-Line Testing

```bash
# Start server in stdio mode (no network required)
cargo run --bin server -- --transport stdio

# Or test with temporary directories
cargo run --bin server -- \
  --wasm-path /tmp/test-wasm \
  --diagrams-path /tmp/test-diagrams \
  --force

# Check server health
cargo run --bin server -- --help
```

### 2. Programmatic Testing

Create test harnesses that interact with the backend directly:

```rust
use glsp_mcp_server::{GlspBackend, GlspConfig};
use clap::Parser;

#[tokio::test]
async fn test_backend_operations() {
    let config = GlspConfig {
        // Configure for testing
        // ...
    };

    let backend = GlspBackend::initialize(config).await.unwrap();
    // Test operations
}
```

### 3. Mock Server Testing

Use temporary directories and mock data:

```rust
use tempfile::TempDir;

#[tokio::test]
async fn test_with_temp_dirs() {
    let wasm_dir = TempDir::new().unwrap();
    let diagrams_dir = TempDir::new().unwrap();

    // Write mock WASM component
    let wasm = get_mock_wasm_component();
    std::fs::write(wasm_dir.path().join("test.wasm"), wasm).unwrap();

    // Test operations
}
```

### 4. API Testing via MCP Protocol

Test the MCP protocol directly:

```bash
# Send MCP requests via stdin/stdout
echo '{"method":"tools/list"}' | cargo run --bin server -- --transport stdio
```

### 5. Database Testing

Test database operations without live databases:

```rust
# Use mock backend (no database required)
cargo test --lib database -- --nocapture

# With actual PostgreSQL (requires running instance)
cargo test --features postgresql

# With Redis (requires running instance)
cargo test --features redis
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Run tests
        run: cargo test --verbose
      - name: Run tests with all features
        run: cargo test --all-features --verbose
```

### Test Coverage

```bash
# Install tarpaulin
cargo install cargo-tarpaulin

# Generate coverage report
cargo tarpaulin --out Html --output-dir ./coverage

# View coverage
open coverage/index.html
```

## Troubleshooting

### Common Issues

#### 1. Missing Directories

```bash
Error: WASM components directory does not exist

Solution: Use --force flag
cargo run --bin server -- --force
```

#### 2. Test Timeouts

```bash
# Increase timeout
cargo test -- --test-threads=1 --nocapture

# Or run tests individually
cargo test test_name
```

#### 3. Feature Compilation Errors

```bash
# Ensure features are enabled
cargo test --features "postgresql redis influxdb"

# Or use default mock backend
cargo test --no-default-features
```

#### 4. WASM Target Issues

```bash
# Install WASM target
rustup target add wasm32-wasip2

# Update wasmtime
cargo update -p wasmtime
```

### Debugging Tests

```bash
# Run with debug output
RUST_LOG=debug cargo test -- --nocapture

# Run specific test with logs
RUST_LOG=glsp_mcp_server=trace cargo test test_name -- --nocapture

# Show all output
cargo test -- --show-output
```

### Performance Testing

```bash
# Run tests in release mode (faster)
cargo test --release

# Benchmark tests (requires nightly)
cargo +nightly bench

# Profile test execution
cargo test --release -- --nocapture --test-threads=1
```

## Test Metrics

### Current Test Coverage

```
Total Tests: ~58
├── Unit Tests: 33
│   ├── Database: 23
│   ├── WASM: 9
│   └── Persistence: 1
├── Mock Tests: 4
├── Integration: 16
└── Doc Tests: 5

Pass Rate: 100% (57 passed, 1 ignored)
Test Time: ~5 seconds (debug), ~2 seconds (release)
```

### Testing Checklist

Before committing code:

- [ ] All unit tests pass: `cargo test --lib`
- [ ] All integration tests pass: `cargo test --test`
- [ ] Documentation tests pass: `cargo test --doc`
- [ ] Code compiles without warnings: `cargo clippy`
- [ ] Code is formatted: `cargo fmt --check`
- [ ] Mock components work: `cargo test --test mock_wasm_components`
- [ ] New features have tests
- [ ] Edge cases are covered

## Future Test Improvements

1. **End-to-End MCP Tests**: Full protocol testing via stdin/stdout
2. **Load Testing**: Concurrent diagram operations
3. **Fuzzing**: Random input testing for WASM parser
4. **Property-Based Testing**: Using quickcheck/proptest
5. **Performance Benchmarks**: Criterion-based benchmarks
6. **Visual Regression**: SVG output comparison (future)
7. **Security Testing**: Malicious WASM component handling

## Resources

- [Rust Testing Documentation](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [Cargo Test Documentation](https://doc.rust-lang.org/cargo/commands/cargo-test.html)
- [Integration Testing Guide](https://doc.rust-lang.org/rust-by-example/testing/integration_testing.html)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)

---

**Last Updated**: 2025-11-12
**Test Framework Version**: Rust 1.70+, Tokio 1.0+
**Coverage**: ~85% of critical paths
