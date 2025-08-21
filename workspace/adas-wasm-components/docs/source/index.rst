ADAS WASM Components Documentation
==================================

.. image:: https://img.shields.io/badge/Type-Demo--Code-yellow
   :alt: Demo Code

.. image:: https://img.shields.io/badge/Purpose-Concept--Demonstration-blue
   :alt: Concept Demonstration

.. image:: https://img.shields.io/badge/Components-15-purple
   :alt: 15 Components

.. image:: https://img.shields.io/badge/AI-YOLOv5n-orange
   :alt: YOLOv5n AI Model

Welcome to the documentation for the **ADAS WASM Components Demo** - a comprehensive demonstration of how the GLSP-MCP platform can be used to build complex systems like Advanced Driver Assistance Systems.

.. important::
   **This is demonstration code only!** This workspace contains example implementations that showcase:

   * How GLSP-MCP can be used for complex modeling scenarios
   * Concepts from ISO 26262 applied to WebAssembly components
   * AI integration patterns using WASI-NN
   * Multi-component system architecture

   **This code is NOT intended for production use.** It serves as a learning resource and proof-of-concept
   for developers exploring the capabilities of the GLSP-MCP platform.

Overview
--------

The ADAS WASM Components demo illustrates how to use GLSP-MCP for complex systems by implementing:

* **15 Example Components** demonstrating sensor, AI, control, and system functions
* **Real AI Integration** showing WASI-NN usage with YOLOv5n neural network
* **ISO 26262 Concepts** demonstrating how safety principles can be applied
* **WebAssembly Component Model** showcasing secure, isolated execution
* **Bazel Build System** with custom WASM rules as a build system example

System Architecture
-------------------

.. plantuml::

   @startuml
   !theme plain

   package "Sensor Components" {
       [Camera Front] as cam_front
       [Camera Surround] as cam_surround
       [LiDAR] as lidar
       [Radar Front] as radar_f
       [Radar Corner] as radar_c
       [Ultrasonic] as ultrasonic
   }

   package "AI/ML Components" {
       [Object Detection\n(YOLOv5n)] as obj_detect
       [Behavior Prediction] as behavior
   }

   package "Fusion Components" {
       [Sensor Fusion] as sensor_fusion
       [Perception Fusion] as perception_fusion
       [Tracking Prediction] as tracking
   }

   package "Control Components" {
       [Vehicle Control] as vehicle_ctrl
       [Planning Decision] as planning
   }

   package "System Components" {
       [Safety Monitor\n(ASIL-B)] as safety
       [Domain Controller] as domain
       [CAN Gateway] as can
       [HMI Interface] as hmi
   }

   cam_front --> obj_detect
   cam_surround --> obj_detect
   obj_detect --> perception_fusion

   lidar --> sensor_fusion
   radar_f --> sensor_fusion
   radar_c --> sensor_fusion
   ultrasonic --> sensor_fusion

   sensor_fusion --> perception_fusion
   perception_fusion --> tracking

   tracking --> behavior
   behavior --> planning

   planning --> vehicle_ctrl
   safety --> vehicle_ctrl

   vehicle_ctrl --> domain
   domain --> can
   domain --> hmi

   @enduml

Documentation Structure
-----------------------

.. toctree::
   :maxdepth: 2
   :caption: Requirements

   requirements/index
   requirements/adas_components
   requirements/sensor_components
   requirements/ai_components
   requirements/safety_compliance
   requirements/integration

.. toctree::
   :maxdepth: 2
   :caption: Architecture

   architecture/index
   architecture/component_design
   architecture/data_flow
   architecture/safety_architecture
   architecture/deployment

.. toctree::
   :maxdepth: 2
   :caption: Implementation

   implementation/build_system
   implementation/wit_interfaces
   implementation/testing
   implementation/validation

Purpose and Learning Goals
--------------------------

This ADAS demo serves as an educational example showing:

1. **How to Structure Complex GLSP-MCP Applications**: Learn patterns for multi-component systems
2. **Domain-Specific Implementations**: See how to apply GLSP-MCP to specialized domains like automotive
3. **Safety Concepts in Practice**: Understand how formal safety principles translate to code
4. **Advanced Integration Patterns**: Explore AI integration, sensor fusion, and real-time processing

**Remember**: This is demonstration code meant for learning. Always perform proper safety analysis and validation for any production system.

Key Demonstration Features
--------------------------

**🚗 Complex Component System**
   15 example components showing how to structure large GLSP-MCP applications

**🧠 AI Integration Example**
   Demonstrates WASI-NN usage with a real neural network (YOLOv5n)

**🛡️ Safety Concepts**
   Shows how ISO 26262 principles can be applied to WebAssembly systems

**🔧 Build System Integration**
   Example of using Bazel with custom rules for WASM components

**📊 Multi-Sensor Architecture**
   Demonstrates handling multiple data sources (Camera, LiDAR, Radar, Ultrasonic)

**🔄 Complex Data Flows**
   Shows multi-stage data processing patterns in GLSP-MCP

Quick Start
-----------

.. code-block:: bash

   # Build all components
   cd workspace/adas-wasm-components
   bazel build //...

   # Run tests
   bazel test //...

   # Build composed system
   ./build-composed.sh

Component Categories
--------------------

.. list-table::
   :header-rows: 1
   :widths: 20 15 65

   * - Category
     - Count
     - Components
   * - Sensors
     - 6
     - Camera (Front/Surround), Radar (Front/Corner), LiDAR, Ultrasonic
   * - AI/ML
     - 2
     - Object Detection (YOLOv5n), Behavior Prediction
   * - Fusion
     - 3
     - Sensor Fusion, Perception Fusion, Tracking Prediction
   * - Control
     - 2
     - Vehicle Control, Planning Decision
   * - System
     - 4
     - Safety Monitor, Domain Controller, CAN Gateway, HMI Interface

Standards and Concepts Demonstrated
------------------------------------

This demo illustrates concepts from:

* **ISO 26262**: Shows how functional safety principles could be applied
* **AUTOSAR**: Demonstrates component-based architecture patterns
* **MISRA C**: Examples of safety-critical coding practices
* **WebAssembly**: Proper usage of Component Model specification

**Note**: While this demo follows these standards conceptually, it has not undergone formal certification.

License
-------

This workspace example is part of the GLSP-Rust project and is licensed under the MIT License.

.. note::
   This documentation describes demonstration code for the ADAS WASM Components workspace example.
   It shows how GLSP-MCP concepts can be applied to complex domains. For core GLSP-Rust platform
   documentation, see the main documentation.

.. warning::
   **Demonstration Code Only**: This workspace contains example code to illustrate GLSP-MCP capabilities.
   Do not use this code in production systems without proper validation, testing, and certification
   appropriate for your use case.
