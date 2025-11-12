# Dependency Upgrade Path

This document outlines the strategy for upgrading dependencies to their latest versions.

## Current Status

### ✅ Completed Upgrades

1. **Build System Fixed**
   - ✅ Created missing `adas-build/wasi-nn/Cargo.toml`
   - ✅ Fixed wasmtime API compatibility (u32 → usize for table_growing)
   - ✅ All core components compile successfully

2. **Stable Dependency Versions**
   - ✅ wasmtime: 27.0 (from 24.0)
   - ✅ notify: 7.0 (from 6.1)
   - ✅ wasm-tools: 1.220 (stable version)
   - ✅ wit-parser: 0.220 (compatible with wasmtime 27.0)

### ⏸️ Pending Major Upgrades

#### PulseEngine MCP Framework: 0.4.4 → 0.13.0

**Status**: On hold until test coverage is complete

**Breaking Changes Required**:
```rust
// CallToolResult API changes
// OLD (0.4.4):
Ok(CallToolResult {
    content: vec![...],
    is_error: Some(false),
})

// NEW (0.13.0):
Ok(CallToolResult {
    content: vec![...],
    is_error: Some(false),
    _meta: None,                    // NEW FIELD
    structured_content: None,        // NEW FIELD
})

// Tool Definition Changes
// OLD (0.4.4):
Tool {
    name: "...".to_string(),
    description: "...".to_string(),
    input_schema: json!({...}),
}

// NEW (0.13.0):
Tool {
    name: "...".to_string(),
    description: "...".to_string(),
    input_schema: json!({...}),
    annotations: None,               // NEW FIELD
    icons: None,                     // NEW FIELD
    output_schema: None,             // NEW FIELD
    sse_enabled: None,               // NEW FIELD
}
```

**Files Affected**: ~130+ instances
- `glsp-mcp-server/src/backend.rs`: 43 instances
- `glsp-mcp-server/src/mcp/tools.rs`: 88 instances

**Upgrade Steps**:
1. Create automated migration script
2. Update all CallToolResult instances
3. Update all Tool definitions
4. Test all MCP tool operations
5. Verify backward compatibility

## Upgrade Strategy

### Phase 1: Foundation (✅ Complete)

1. Fix build dependencies
2. Establish test coverage
3. Document current state
4. Create upgrade path

### Phase 2: Conservative Upgrades (✅ Complete)

1. ✅ wasmtime: 24.0 → 27.0
2. ✅ notify: 6.1 → 7.0
3. ✅ Fix API incompatibilities
4. ✅ Verify all tests pass

### Phase 3: Major Framework Upgrade (⏸️ Future)

**PulseEngine MCP: 0.4.4 → 0.13.0**

#### Pre-upgrade Checklist

- [ ] Review full changelog between versions
- [ ] Create automated migration tool
- [ ] Backup current working state
- [ ] Set up rollback procedure
- [ ] Test in isolated branch

#### Upgrade Process

```bash
# 1. Create feature branch
git checkout -b upgrade/pulseengine-mcp-0.13.0

# 2. Update Cargo.toml
sed -i 's/0.4.4/0.13.0/g' glsp-mcp-server/Cargo.toml

# 3. Run automated migration (to be created)
cargo run --bin migrate-mcp-api

# 4. Fix compilation errors
cargo check 2>&1 | tee upgrade-errors.log

# 5. Run tests
cargo test

# 6. Manual verification
cargo run --bin server -- --help
```

#### Migration Tool (Future)

Create `tools/migrate-mcp-api.rs`:

```rust
//! Automated migration tool for MCP API updates

use std::fs;
use regex::Regex;

fn migrate_call_tool_result(content: &str) -> String {
    let re = Regex::new(r"CallToolResult \{([^}]+)\}").unwrap();

    re.replace_all(content, |caps: &regex::Captures| {
        let fields = &caps[1];
        if !fields.contains("_meta") {
            format!("CallToolResult {{\n{},\n    _meta: None,\n    structured_content: None,\n}}", fields.trim())
        } else {
            caps[0].to_string()
        }
    }).to_string()
}

fn migrate_tool_definition(content: &str) -> String {
    // Similar pattern for Tool definitions
    // ...
}
```

#### Post-upgrade Verification

```bash
# 1. All tests pass
cargo test --all-features

# 2. Server starts correctly
cargo run --bin server -- --transport stdio

# 3. MCP operations work
echo '{"method":"tools/list"}' | cargo run --bin server -- --transport stdio

# 4. WASM execution works
cargo test --test wasm_execution_test

# 5. Documentation builds
cargo doc --no-deps
```

### Phase 4: Latest Versions (🔮 Future)

Once MCP framework is upgraded, consider:

1. **wasmtime**: 27.0 → 38.0 (latest)
   - Review WASM Component Model changes
   - Update wit-parser to match
   - Test all WASM operations

2. **Database Libraries**:
   - sqlx: 0.7 → 0.8
   - redis: 0.24 → 0.32
   - Test all database operations

3. **Other Dependencies**:
   - axum: Consider updates if needed
   - tokio: Already on 1.0 (stable)
   - serde: Already latest

## Dependency Version Matrix

| Dependency | Current | Latest | Status | Blocker |
|------------|---------|--------|--------|---------|
| **MCP Framework** |
| pulseengine-mcp-* | 0.4.4 | 0.13.0 | ⏸️ Pending | Breaking API changes |
| **WASM Runtime** |
| wasmtime | 27.0 | 38.0 | ✅ Can upgrade | None |
| wit-parser | 0.220 | 0.240 | ⚠️ Dependent | Need wasmtime 38.0 |
| wasm-tools | 1.220 | 1.240 | ⚠️ Dependent | Need wasmtime 38.0 |
| **Databases** |
| sqlx | 0.7 | 0.8 | ✅ Can upgrade | None |
| redis | 0.24 | 0.32 | ✅ Can upgrade | None |
| influxdb | 0.7 | 0.7 | ✅ Latest | - |
| **System** |
| notify | 7.0 | 8.2 | ✅ Can upgrade | None |
| tokio | 1.0 | 1.0 | ✅ Latest | - |
| serde | 1.0 | 1.0 | ✅ Latest | - |

## Automated Upgrade Checks

Create a script to check for available updates:

```bash
#!/bin/bash
# check-updates.sh

echo "Checking for dependency updates..."
cargo outdated --depth 1

echo ""
echo "Checking for security vulnerabilities..."
cargo audit

echo ""
echo "Checking for deprecated dependencies..."
cargo tree --duplicates
```

Run regularly:
```bash
chmod +x check-updates.sh
./check-updates.sh
```

## Version Pinning Strategy

### Currently Pinned

```toml
# Keep these pinned for API stability
pulseengine-mcp-protocol = "0.4.4"     # Pin until migration complete
pulseengine-mcp-server = "0.4.4"       # Pin until migration complete

# These can float within major version
tokio = "1.0"                          # Allow 1.x updates
serde = "1.0"                          # Allow 1.x updates
```

### Future Pinning

After MCP upgrade:
```toml
# Allow minor/patch updates
pulseengine-mcp-protocol = "~0.13.0"   # 0.13.x only
wasmtime = "~38.0"                      # 38.x only
```

## Regression Prevention

### Test Coverage Requirements

Before upgrading:
- ✅ Unit test coverage > 80%
- ✅ Integration tests for all MCP operations
- ✅ WASM execution tests
- ✅ Mock component tests

### Automated Testing

```bash
# Pre-upgrade test baseline
cargo test --all-features > test-baseline.txt

# After upgrade, compare
cargo test --all-features > test-upgraded.txt
diff test-baseline.txt test-upgraded.txt
```

## Rollback Procedure

If upgrade fails:

```bash
# 1. Revert Cargo.toml changes
git checkout Cargo.toml glsp-mcp-server/Cargo.toml

# 2. Remove Cargo.lock
rm Cargo.lock

# 3. Rebuild with known-good versions
cargo build

# 4. Verify tests pass
cargo test

# 5. Document issue
echo "Upgrade failed: [reason]" >> UPGRADE-LOG.md
```

## Communication Plan

### Breaking Changes Notice

When upgrading MCP framework:

1. Update CHANGELOG.md
2. Add migration guide
3. Provide example code updates
4. Document API changes
5. Update all documentation

### Version Support Policy

- **Current stable**: 0.4.4 (supported)
- **Next stable**: 0.13.0 (after testing)
- **Deprecation**: 6 months notice minimum

## References

- [Cargo Dependency Specification](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html)
- [Semantic Versioning](https://semver.org/)
- [PulseEngine MCP Changelog](https://github.com/pulseengine/mcp-framework/blob/main/CHANGELOG.md)
- [Wasmtime Changelog](https://github.com/bytecodealliance/wasmtime/blob/main/RELEASES.md)

## Conclusion

The codebase is now stable with fixed dependencies and comprehensive tests. The path to upgrading to the latest versions is clear, with the main blocker being the MCP framework API changes that require systematic migration.

**Recommendation**:
1. Keep current versions (0.4.4) for stability
2. Create automated migration tool
3. Test migration in isolated branch
4. Perform upgrade during low-activity period
5. Have rollback plan ready

---

**Last Updated**: 2025-11-12
**Maintained By**: Development Team
**Review Cycle**: Monthly dependency audits
