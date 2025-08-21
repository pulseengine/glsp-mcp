System Design Architecture
=========================

This document describes the high-level system design and architecture patterns for the GLSP-Rust platform.

.. contents::
   :local:

System Overview
--------------

GLSP-Rust implements a layered architecture designed for AI-native diagram creation and manipulation.

.. arch_req:: System Design Overview
   :id: SYS_001
   :status: implemented
   :priority: critical
   :description: Multi-layered system architecture with clear separation of concerns

   The system consists of the following layers:

   * **Presentation Layer**: Web-based UI with Canvas rendering
   * **API Layer**: MCP protocol implementation
   * **Business Logic Layer**: Core diagram operations
   * **Data Layer**: Multi-backend database support
   * **Infrastructure Layer**: WASM runtime and execution

Architectural Patterns
--------------------

.. arch_req:: Hexagonal Architecture
   :id: SYS_002
   :status: implemented
   :priority: high
   :description: Ports and adapters pattern for clean separation

   The system implements hexagonal architecture:

   * **Core Domain**: Diagram models and business logic
   * **Input Ports**: MCP tools and resources
   * **Output Ports**: Database adapters and WASM execution
   * **Infrastructure**: HTTP server, database drivers

Service Architecture
------------------

.. arch_req:: Microservice Patterns
   :id: SYS_003
   :status: implemented
   :priority: medium
   :description: Service-oriented architecture for scalability

   Services are organized as:

   * **Diagram Service**: Core diagram operations
   * **WASM Service**: Component execution
   * **Database Service**: Data persistence
   * **AI Service**: Natural language processing
