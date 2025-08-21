Safety Compliance Demonstration Requirements
============================================

This document demonstrates how automotive safety standards concepts could be applied to GLSP-MCP systems, using ISO 26262 as an example framework.

.. important::
   **This is demonstration code only!** These requirements show how safety principles could be
   structured in a real system. This code has NOT undergone actual ISO 26262 certification
   and should NOT be used in safety-critical applications without proper validation.

.. contents::
   :local:
   :depth: 2

Overview
--------

This demo shows how an ADAS system could be structured to follow **ISO 26262 ASIL-B** principles.
It serves as an educational example of applying safety standards to WebAssembly component systems.

ISO 26262 Compliance Requirements
---------------------------------

Functional Safety Management
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. adas_safety:: Safety Lifecycle Management
   :id: ADAS_SAFETY_001
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-2:2018
   :component_category: safety
   :links: SAFETY_031

   The ADAS system shall follow the complete safety lifecycle from concept through decommissioning,
   with documented safety plans, assessments, and validation reports per ISO 26262-2.

.. adas_safety:: Safety Culture and Competence
   :id: ADAS_SAFETY_002
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-2:2018 Clause 5
   :component_category: safety

   Development team shall demonstrate competence in functional safety with documented training
   records and qualification evidence for ASIL-B development.

.. adas_safety:: Safety Case Documentation
   :id: ADAS_SAFETY_003
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-2:2018 Clause 6
   :component_category: safety

   A comprehensive safety case shall document all safety arguments, evidence, and assumptions
   demonstrating ASIL-B compliance for the ADAS system.

Hazard Analysis and Risk Assessment
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. adas_safety:: HARA Documentation
   :id: ADAS_SAFETY_004
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-3:2018
   :component_category: safety

   Hazard Analysis and Risk Assessment (HARA) shall identify all hazards with severity (S),
   exposure (E), and controllability (C) ratings determining ASIL levels.

.. adas_safety:: Safety Goals Definition
   :id: ADAS_SAFETY_005
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-3:2018 Clause 7
   :component_category: safety

   Top-level safety goals shall be derived from HARA with measurable acceptance criteria:
   - SG1: Prevent unintended acceleration (ASIL-B)
   - SG2: Maintain safe following distance (ASIL-B)
   - SG3: Prevent collision with VRUs (ASIL-B)

Technical Safety Requirements
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. adas_safety:: Fault Detection and Diagnosis
   :id: ADAS_SAFETY_006
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-5:2018
   :component_category: safety
   :latency_requirement: 100ms
   :links: ADAS_REQ_009

   The system shall detect safety-critical faults within 100ms including sensor failures,
   communication errors, and processing anomalies with diagnostic coverage >90%.

.. adas_safety:: Safe State Definition
   :id: ADAS_SAFETY_007
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-4:2018
   :component_category: safety

   Safe states shall be defined for all failure modes:
   - Sensor failure: Degraded operation with remaining sensors
   - AI failure: Fallback to rule-based algorithms
   - Communication failure: Local autonomous operation
   - Complete failure: Driver takeover with warnings

.. adas_safety:: Fault Tolerance Mechanisms
   :id: ADAS_SAFETY_008
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-5:2018 Clause 9
   :component_category: safety

   The system shall implement fault tolerance through:
   - Redundant sensors (2oo3 voting for critical functions)
   - Diverse algorithms (AI + rule-based)
   - Temporal redundancy (multiple calculation cycles)

Software Safety Requirements
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. adas_safety:: Software Architecture Safety
   :id: ADAS_SAFETY_009
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-6:2018
   :component_category: safety
   :links: ADAS_REQ_002

   Software architecture shall ensure freedom from interference between ASIL-B and QM
   components using WebAssembly sandboxing and typed interfaces.

.. adas_safety:: Software Unit Design
   :id: ADAS_SAFETY_010
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-6:2018 Clause 8
   :component_category: safety

   Software units shall follow MISRA C guidelines with static analysis achieving:
   - Zero critical violations
   - <5 major violations per KLOC
   - 100% decidable rule compliance

.. adas_safety:: Software Integration Testing
   :id: ADAS_SAFETY_011
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-6:2018 Clause 10
   :component_category: safety

   Integration testing shall achieve:
   - 100% interface coverage
   - Resource usage testing (memory, CPU)
   - Timing and performance verification
   - Fault injection testing

Hardware-Software Integration
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. adas_safety:: HSI Requirements
   :id: ADAS_SAFETY_012
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-4:2018 Clause 7
   :component_category: safety

   Hardware-Software Interface (HSI) shall specify:
   - Sensor interfaces and failure modes
   - Actuator command limits and diagnostics
   - Watchdog timer configuration
   - Memory protection requirements

.. adas_safety:: Timing Constraints
   :id: ADAS_SAFETY_013
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-6:2018
   :component_category: safety
   :latency_requirement: 100ms
   :links: ADAS_REQ_003

   Worst-Case Execution Time (WCET) analysis shall prove timing constraints:
   - Sensor to perception: <50ms
   - Perception to control: <30ms
   - Control to actuator: <20ms

Verification and Validation
~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. adas_safety:: Safety Validation Plan
   :id: ADAS_SAFETY_014
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-4:2018 Clause 9
   :component_category: safety

   Safety validation shall include:
   - Vehicle-level testing on proving grounds
   - HIL testing with fault injection
   - Field operational tests (100,000 km)
   - Edge case scenario testing

.. adas_safety:: Proven in Use Argument
   :id: ADAS_SAFETY_015
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-8:2018 Clause 14
   :component_category: safety

   Components with proven in use arguments (WebAssembly runtime, Linux kernel)
   shall document operational history >10^7 hours with failure analysis.

Safety Monitoring Requirements
------------------------------

.. adas_safety:: Runtime Safety Monitor
   :id: ADAS_SAFETY_016
   :status: implemented
   :asil_level: B
   :component_category: safety
   :wit_interface: system/safety-monitor.wit
   :bazel_target: //components/system/safety-monitor

   The safety monitor component shall continuously verify:
   - Component health status (100ms cycle)
   - Data flow integrity checks
   - Timing constraint violations
   - Resource usage limits

.. adas_safety:: Plausibility Checks
   :id: ADAS_SAFETY_017
   :status: implemented
   :asil_level: B
   :component_category: safety

   All sensor data shall undergo plausibility checks:
   - Physical constraints (max velocity, acceleration)
   - Cross-sensor validation
   - Temporal consistency
   - Environmental context

.. adas_safety:: Safety Metrics Collection
   :id: ADAS_SAFETY_018
   :status: implemented
   :asil_level: B
   :component_category: safety

   The system shall collect safety metrics:
   - Fault detection rate
   - False positive/negative rates
   - Recovery success rate
   - Safety goal violations

Production and Operation
------------------------

.. adas_safety:: Production Quality Control
   :id: ADAS_SAFETY_019
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-7:2018
   :component_category: safety

   Production shall include:
   - Software build reproducibility
   - Configuration management per ASIL-B
   - Calibration data validation
   - End-of-line testing procedures

.. adas_safety:: Field Monitoring
   :id: ADAS_SAFETY_020
   :status: implemented
   :asil_level: B
   :iso_reference: ISO 26262-7:2018 Clause 6
   :component_category: safety

   Field monitoring shall track:
   - Safety-related field failures
   - Near-miss events
   - Performance degradation
   - Software update effectiveness

Requirements Summary
--------------------

.. needflow::
   :types: adas_safety
   :show_filters:
   :show_legend:

.. needtable::
   :types: adas_safety
   :columns: id, title, asil_level, iso_reference, status
   :style: table
   :sort: id

Compliance Matrix
-----------------

.. list-table::
   :header-rows: 1
   :widths: 40 20 20 20

   * - ISO 26262 Part
     - Clauses Addressed
     - ASIL Level
     - Status
   * - Part 2: Management of functional safety
     - All
     - B
     - Compliant
   * - Part 3: Concept phase
     - All
     - B
     - Compliant
   * - Part 4: Product development at system level
     - 5-9
     - B
     - Compliant
   * - Part 5: Hardware development
     - N/A
     - -
     - SEooC
   * - Part 6: Software development
     - 5-11
     - B
     - Compliant
   * - Part 7: Production and operation
     - 5-6
     - B
     - Compliant
   * - Part 8: Supporting processes
     - 9, 14
     - B
     - Compliant
