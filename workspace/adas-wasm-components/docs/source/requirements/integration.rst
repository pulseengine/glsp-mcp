Integration Requirements
========================

This document specifies requirements for system integration and component composition in the ADAS WASM Components system.

.. contents::
   :local:
   :depth: 2

Overview
--------

Integration requirements define how the 15 ADAS components work together as a cohesive system, including component composition, data flow orchestration, and vehicle integration.

Component Composition Requirements
----------------------------------

.. adas_req:: WAC-based Composition
   :id: ADAS_INT_001
   :status: implemented
   :asil_level: B
   :component_category: integration
   :bazel_target: //:adas-complete-system
   :links: WASM_046

   The ADAS system shall use WebAssembly Composition (WAC) to statically link components
   into deployable units with verified interface compatibility at build time.

.. adas_req:: Composition Validation
   :id: ADAS_INT_002
   :status: implemented
   :asil_level: B
   :component_category: integration

   Component composition shall validate:
   - WIT interface version compatibility
   - Resource requirement conflicts
   - Circular dependency detection
   - ASIL level compatibility (no QM→B dependencies)

.. adas_req:: Multi-Profile Composition
   :id: ADAS_INT_003
   :status: implemented
   :asil_level: QM
   :component_category: integration

   The system shall support multiple composition profiles:
   - Full ADAS: All 15 components
   - Basic ADAS: Essential safety components only
   - Development: With debug and visualization
   - Simulation: With simulated sensor inputs

Interface Management Requirements
---------------------------------

.. adas_req:: WIT Interface Versioning
   :id: ADAS_INT_004
   :status: implemented
   :asil_level: B
   :component_category: integration
   :wit_interface: adas-common/versioning.wit
   :links: ADAS_REQ_011

   All WIT interfaces shall use semantic versioning with backward compatibility
   guaranteed within major versions and deprecation notices for breaking changes.

.. adas_req:: Interface Registry
   :id: ADAS_INT_005
   :status: implemented
   :asil_level: B
   :component_category: integration

   A central interface registry shall maintain:
   - All WIT interface definitions
   - Version compatibility matrix
   - Usage documentation
   - Migration guides

Data Flow Integration
---------------------

.. adas_req:: Data Flow Orchestration
   :id: ADAS_INT_006
   :status: implemented
   :asil_level: B
   :component_category: integration
   :wit_interface: orchestration/data-flow.wit
   :bazel_target: //components/orchestrator

   The orchestrator component shall manage data flow between components ensuring:
   - Correct execution order
   - Data availability checking
   - Timeout handling
   - Backpressure management

.. adas_req:: Zero-Copy Data Passing
   :id: ADAS_INT_007
   :status: implemented
   :asil_level: B
   :component_category: integration
   :latency_requirement: 1ms

   Large data transfers (camera frames, point clouds) shall use zero-copy mechanisms
   through shared memory with ownership transfer completing within 1ms.

.. adas_req:: Data Format Standardization
   :id: ADAS_INT_008
   :status: implemented
   :asil_level: B
   :component_category: integration

   All components shall use standardized data formats:
   - Images: YUV420, RGB888
   - Point clouds: PCL2 format
   - Objects: ASAM OpenDRIVE
   - Time: TAI with microsecond precision

Vehicle Integration Requirements
--------------------------------

.. adas_req:: CAN Bus Integration
   :id: ADAS_INT_009
   :status: implemented
   :asil_level: B
   :component_category: integration
   :wit_interface: system/can-gateway.wit
   :bazel_target: //components/system/can-gateway
   :links: ADAS_REQ_015

   The CAN gateway shall support:
   - CAN-FD up to 8 Mbps
   - J1939 protocol for commercial vehicles
   - DBC file parsing for signal definitions
   - Endianness handling (big/little)

.. adas_req:: Actuator Command Interface
   :id: ADAS_INT_010
   :status: implemented
   :asil_level: B
   :component_category: integration
   :latency_requirement: 10ms

   Actuator commands shall be transmitted with:
   - Dual-channel redundancy
   - CRC protection
   - Sequence numbering
   - Maximum 10ms latency

.. adas_req:: Vehicle State Integration
   :id: ADAS_INT_011
   :status: implemented
   :asil_level: B
   :component_category: integration

   The system shall integrate vehicle state including:
   - Speed, acceleration, yaw rate
   - Steering angle and rate
   - Brake pressure and status
   - Gear position and engine state

Development Integration
-----------------------

.. adas_req:: GLSP Diagram Integration
   :id: ADAS_INT_012
   :status: implemented
   :asil_level: QM
   :component_category: integration
   :links: REQ_001

   The ADAS system architecture shall be maintainable through GLSP diagrams
   with automatic code generation for component interfaces and data flow.

.. adas_req:: Simulation Integration
   :id: ADAS_INT_013
   :status: implemented
   :asil_level: QM
   :component_category: integration
   :links: SIM_001

   Components shall support simulation mode with:
   - Synthetic sensor data injection
   - Time scaling (faster/slower than real-time)
   - Scenario replay capability
   - Deterministic execution

.. adas_req:: Debug Interface
   :id: ADAS_INT_014
   :status: implemented
   :asil_level: QM
   :component_category: integration
   :wit_interface: debug/debug-interface.wit

   All components shall expose debug interfaces for:
   - Internal state inspection
   - Performance profiling
   - Event logging
   - Breakpoint support

Deployment Integration
----------------------

.. adas_req:: Container Deployment
   :id: ADAS_INT_015
   :status: implemented
   :asil_level: QM
   :component_category: integration

   The ADAS system shall support containerized deployment with:
   - OCI-compliant containers
   - Resource limits enforcement
   - Health check endpoints
   - Rolling update capability

.. adas_req:: Hardware Platform Support
   :id: ADAS_INT_016
   :status: implemented
   :asil_level: B
   :component_category: integration

   The system shall support deployment on:
   - ARM Cortex-A72 (primary target)
   - x86-64 (development/simulation)
   - NVIDIA Jetson (AI acceleration)
   - Qualcomm Snapdragon Ride

Monitoring and Diagnostics
--------------------------

.. adas_req:: System Monitoring
   :id: ADAS_INT_017
   :status: implemented
   :asil_level: B
   :component_category: integration
   :wit_interface: monitoring/system-monitor.wit

   System monitoring shall track:
   - Component health status
   - Resource utilization
   - Data flow latencies
   - Error rates and types

.. adas_req:: Diagnostic Trouble Codes
   :id: ADAS_INT_018
   :status: implemented
   :asil_level: B
   :component_category: integration

   The system shall generate DTCs (Diagnostic Trouble Codes) compatible
   with OBD-II/UDS protocols for workshop diagnostics.

.. adas_req:: Event Data Recorder
   :id: ADAS_INT_019
   :status: implemented
   :asil_level: B
   :component_category: integration

   An event data recorder shall capture:
   - Pre-crash data (5 seconds)
   - System state at fault detection
   - Sensor data snapshots
   - Control commands issued

.. adas_req:: Remote Diagnostics
   :id: ADAS_INT_020
   :status: implemented
   :asil_level: QM
   :component_category: integration

   The system shall support secure remote diagnostics including:
   - Log file retrieval
   - Configuration updates
   - Performance metrics
   - Software version reporting

Requirements Summary
--------------------

.. needflow::
   :types: adas_req
   :filter: "ADAS_INT" in id
   :show_filters:
   :show_legend:

.. needtable::
   :types: adas_req
   :filter: "ADAS_INT" in id
   :columns: id, title, asil_level, component_category, status
   :style: table
   :sort: id
