# tasklist_mcp_client

A small Rust client that turns an `amt-compose` project (WIT packages + interfaces) into a workflow diagram via the GLSP MCP server, creating nodes/edges through JSON‑RPC tool calls and applying an automatic layout.

> This README documents only the `tasklist_mcp_client/` subproject. For running the GLSP MCP server and web UI, see the repo root README.

## What it does

From the code in `src/main.rs`:

- Reads your `amt-compose` project (WIT) and builds a **TaskList** graph:
  - Each **WIT package** → a **parent Task (node)**
  - Each **interface** of that package → a **child Task (node)**
  - For every package → interface pair it creates a **Transition (edge)**
- Talks to the GLSP MCP server over **JSON‑RPC** at the **`/messages`** endpoint to:
  1) `create_diagram` → returns a `diagram_id`
  2) `create_node` for every Task
  3) `create_edge` for every Transition
  4) `apply_layout` (e.g., hierarchical left‑to‑right)
- Prints the assigned `diagram_id` when done.

The client extracts the IDs from the assistant text in tool responses (it looks for lines like `ID: <uuid>`), and uses a blocking `reqwest` HTTP client.

## Requirements

- Rust (stable)
- A running GLSP MCP server (from this repo) listening on `http://127.0.0.1:3000`
- An **amt-compose** project on disk you want to visualize (path to its project root and config yaml)

## Quick start

1. Start the GLSP MCP server (from repo root):

```bash
cd glsp-mcp-server
cargo run --bin server
# expected: "Server listening on http://127.0.0.1:3000"
```

2. (Optional) Start the web client to see the diagram update live:

```bash
cd ../glsp-web-client
npm install
npm run dev
# open http://localhost:5173
```

3. Configure the client.

Open `tasklist_mcp_client/src/main.rs` and set these variables near `main()`:

```rust
let tool_url = "http://127.0.0.1:3000/messages"; // MCP tool endpoint
let config_path = "amt-compose.yaml";            // your amt-compose config
let project_path = "/path/to/your/amt/project";  // your project root
let diagram_name = "My-Amt-Diagram";             // any label
```

4. Run the client:

```bash
cd tasklist_mcp_client
cargo run --release
```

You should see:

```
✅ Diagram created with ID: <uuid>
```

If the web client is running, refresh the page to view the new diagram.

## How it maps your project → diagram

- **Nodes (Tasks):**
  - Parent node label: WIT **package name**
  - Child node label(s): canonical **interface name(s)** within each package
  - Optional details: interface function names are captured and stored in the `functions` field (prefixed `F:`)
- **Edges (Transitions):**
  - From each **package node** to each **interface node** in that package

## JSON‑RPC tools used

The client posts to `POST {tool_url}` with payloads like:

- `create_diagram`

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_diagram",
    "arguments": {"diagramType": "workflow", "name": "<label>"}
  },
  "id": 1
}
```

- `create_node`

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_node",
    "arguments": {
      "diagramId": "<diagram_id>",
      "nodeType": "task",
      "position": {"x": 100.0, "y": 100.0},
      "label": "<text>"
    }
  },
  "id": 2
}
```

- `create_edge`

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_edge",
    "arguments": {
      "diagramId": "<diagram_id>",
      "edgeType": "sequence-flow",
      "sourceId": "<node_id>",
      "targetId": "<node_id>"
    }
  },
  "id": 3
}
```

- `apply_layout`

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "apply_layout",
    "arguments": {
      "diagramId": "<diagram_id>",
      "algorithm": "hierarchical",
      "direction": "left-right"
    }
  },
  "id": 4
}
```

## Project structure

Key types and helpers in `src/main.rs`:

- `Task`, `Transition`, `TaskList` – in‑memory model used before creating diagram elements
- `wit_interfaces_as_tasks` – collects canonical interface names and function names into `Task`s
- `build_task_list_from_amt_compose` – walks WIT packages → builds nodes/edges
- `DiagramToolClient` – tiny JSON‑RPC client for the MCP tool endpoints
- `generate_diagram_from_amt` – orchestrates: build → create diagram → create nodes/edges → layout

## Troubleshooting

- **HTTP 404/500 from the tool endpoint** – ensure the GLSP MCP server is running and `tool_url` matches its `/messages` endpoint
- **No UUID found in response** – the client parses `ID: <uuid>` from the assistant text; check the server logs and tool outputs
- **Empty diagram** – verify your amt‑compose project and config paths are correct; the client expects WIT packages with interfaces

## License

MIT (see repo root)
