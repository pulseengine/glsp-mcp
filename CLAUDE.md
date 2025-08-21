# MCP-GLSP Development Notes

## Project Overview
This project implements a comprehensive AI-native graphical modeling platform with advanced features:
- **Backend**: Rust HTTP server implementing Model Context Protocol (MCP) over JSON-RPC
- **Frontend**: TypeScript web client with Canvas rendering
- **Database**: Multi-backend support (PostgreSQL, InfluxDB, Redis, SQLite)
- **WASM Runtime**: Full wasmtime integration for sandboxed component execution
- **Simulation**: Time-driven simulation framework with pipeline execution
- **AI Integration**: Ollama LLM for natural language processing

## Complete Architecture
- **MCP Protocol Layer**:
  - Resources → Diagram model state (read-only views)
  - Tools → Diagram operations (create, modify, validate)  
  - Prompts → AI modeling workflows (templates for common tasks)
  
- **Database Layer**:
  - Multi-backend factory pattern
  - PostgreSQL for relational data
  - InfluxDB for time-series sensor data
  - Redis for caching and sessions
  - SQLite for local development
  - Dataset manager for sensor data abstraction
  
- **WASM Execution Engine**:
  - Wasmtime runtime integration
  - Security scanner for component validation
  - Resource limits (memory, CPU, I/O)
  - WIT interface analysis
  - Component discovery and management
  
- **Simulation Framework**:
  - Pipeline-based component execution
  - Sensor data bridge from database
  - Time synchronization modes
  - Scenario management
  - Performance monitoring

## Development Setup

### Backend (Rust)
```bash
cd glsp-mcp-server
cargo build
cargo run --bin server
# Server runs on http://127.0.0.1:3000
```

### Frontend (TypeScript)
**Package Manager Choice: npm** (selected for universal compatibility and zero-setup)
**Note: Requires Node.js and npm**
```bash
cd glsp-web-client
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

### Database Setup
```bash
# PostgreSQL (for diagram storage)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15

# InfluxDB (for sensor data)
docker run -d -p 8086:8086 influxdb:2.7

# Redis (for caching)
docker run -d -p 6379:6379 redis:7
```

### Dependencies Required
- **Rust**: Latest stable version with wasm32-wasip2 target
- **Node.js**: v18+ for frontend development
- **npm**: For frontend package management
- **Docker**: For database services (optional for development)

## Server Endpoints
- `POST /mcp/rpc` - Main MCP JSON-RPC endpoint
- `GET /health` - Server health check
- `POST /wasm/execute` - WASM component execution
- `POST /simulation/run` - Run simulation scenarios
- `GET /database/status` - Database connection status

## MCP Capabilities

### Tools (7 implemented)
- `create_diagram` - Create new diagrams
- `create_node` - Add nodes to diagrams
- `create_edge` - Connect nodes with edges
- `delete_element` - Remove diagram elements
- `update_element` - Modify element properties
- `apply_layout` - Auto-layout algorithms
- `export_diagram` - Export to various formats

### Resources (4 types)
- `diagram://model/{id}` - Diagram model data
- `diagram://validation/{id}` - Validation results
- `diagram://metadata/{id}` - Diagram metadata
- `diagram://list` - List all diagrams

### Prompts (6 templates)
- `generate_workflow` - Create workflow diagrams
- `optimize_layout` - Improve diagram layout
- `add_error_handling` - Add error patterns
- `analyze_diagram` - Analyze for improvements
- `create_subprocess` - Extract subprocesses
- `convert_diagram` - Convert between types

## Database Configuration

Set environment variables or use defaults:
```bash
# PostgreSQL
DATABASE_URL=postgresql://username:password@localhost/glsp  # pragma: allowlist secret

# InfluxDB
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your-token
INFLUXDB_ORG=glsp
INFLUXDB_BUCKET=sensor-data

# Redis
REDIS_URL=redis://localhost:6379

# Or use mock backend for testing
DATABASE_BACKEND=mock
```

## WASM Component Development

### Creating Components
1. Use Rust with wasm32-wasip2 target
2. Define WIT interfaces in `wit/` directory
3. Implement component logic
4. Build with cargo-component
5. Place in component registry

### Example Component
```rust
// Implement WIT interface
wit_bindgen::generate!();

struct Component;

impl Guest for Component {
    fn process(input: Input) -> Output {
        // Component logic here
    }
}
```

## Simulation Framework

### Running Simulations
```yaml
# simulation-config.yaml
simulation:
  name: "Test Scenario"
  pipelines:
    - id: "sensor-pipeline"
      stages:
        - component: "sensor-processor"
          method: "process"
    - id: "ai-pipeline"
      stages:
        - component: "object-detection"
          method: "detect"
          dependencies: ["sensor-pipeline"]
```

```bash
# Run simulation
cargo run --bin simulator -- --config simulation-config.yaml
```

## Testing

### Unit Tests
```bash
cargo test
```

### Integration Tests
```bash
cargo test --features integration
```

### Simulation Tests
```bash
cargo test --features simulation
```

## AI Integration Setup
- **Ollama**: Running on http://127.0.0.1:11434 (local LLM)
- **MCP-GLSP Server**: Running on http://127.0.0.1:3000 (diagram backend)
- **Web Client**: Running on http://localhost:5173 (frontend + AI agent)

## Current Status: 🚀 Advanced Implementation
1. ✅ Complete MCP-GLSP backend with full protocol support
2. ✅ Multi-backend database layer with sensor data management
3. ✅ WASM runtime with security scanning and resource limits
4. ✅ Simulation framework with pipeline execution
5. ✅ Web frontend with Canvas rendering and AI chat
6. ✅ AI agent integration for natural language processing
7. ✅ 20+ ADAS example components demonstrating capabilities

## Performance Metrics
- **API Response**: <100ms for diagram operations
- **WASM Execution**: <20ms for component calls
- **Simulation**: 30+ FPS for real-time scenarios
- **Database**: 10k+ writes/sec for sensor data
- **AI Inference**: <2s for diagram generation

## Advanced Features Implemented
🤖 **Natural Language Processing**: Convert descriptions to diagrams
📊 **AI-Powered Analysis**: Intelligent optimization and validation
🔧 **Component Composition**: Pipeline-based WASM execution
🎨 **Interactive Canvas**: Real-time editing with theme support
📈 **Time-Series Data**: Sensor data streaming and analysis
🔒 **Security**: Sandboxed execution with resource limits
⚡ **Performance**: Async architecture with connection pooling
🧪 **Testing**: Comprehensive test framework with simulations

## Debugging Tips

### Enable Debug Logging
```bash
RUST_LOG=debug cargo run --bin server
```

### Database Connection Issues
```bash
# Test database connection
cargo run --bin test-db-connection
```

### WASM Component Issues
```bash
# Validate component
wasm-tools validate component.wasm

# Check WIT interfaces
wasm-tools component wit component.wasm
```

### Simulation Debugging
```bash
# Run with verbose output
RUST_LOG=glsp_mcp_server::wasm::simulation=trace cargo run
```

## Production Considerations
1. Use environment variables for all configurations
2. Enable TLS for all connections
3. Set appropriate resource limits
4. Configure monitoring and alerting
5. Implement backup strategies
6. Use connection pooling
7. Enable request rate limiting
8. Implement circuit breakers

## Future Enhancements (Planned)
- [ ] Distributed simulation across multiple nodes
- [ ] GPU acceleration for AI components
- [ ] GraphQL API alongside REST
- [ ] Event streaming with Kafka
- [ ] Kubernetes operators for deployment
- [ ] Advanced caching strategies
- [ ] Multi-tenancy support
- [ ] Plugin marketplace

## Important Development Guidelines

### Pre-commit Hook Policy
**CRITICAL**: NEVER disable or comment out pre-commit hooks in .pre-commit-config.yaml without explicit user approval. Pre-commit hooks are essential for:
- Code quality and consistency
- Security scanning and vulnerability detection
- License compliance
- Build integrity

**If pre-commit hooks are failing:**
1. Fix the underlying issues causing failures
2. Ask the user for guidance if fixes are complex or require architectural changes
3. Only disable hooks with explicit user permission
4. Always document why hooks were disabled if approved by user

**Examples of proper responses to hook failures:**
- ✅ Fix TypeScript errors, formatting issues, or linting problems
- ✅ Update code to pass security scans
- ✅ Ask user: "TypeScript check is failing due to 200+ existing type errors. Should I fix these or would you prefer to disable the check temporarily?"
- ❌ Automatically disable hooks without asking