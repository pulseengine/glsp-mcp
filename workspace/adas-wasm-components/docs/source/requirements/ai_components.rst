AI Component Requirements
=========================

This document specifies requirements for the AI/ML components in the ADAS system, including object detection and behavior prediction.

.. contents::
   :local:
   :depth: 2

Overview
--------

The ADAS system includes two primary AI components:

* **Object Detection**: YOLOv5n-based neural network for real-time object detection
* **Behavior Prediction**: Trajectory prediction for detected objects

These components leverage WASI-NN for neural network inference within WebAssembly.

Object Detection Requirements
-----------------------------

Core Detection Requirements
~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. ai_comp:: Real-time Object Detection
   :id: AI_COMP_001
   :status: implemented
   :asil_level: B
   :component_category: ai
   :ai_model: YOLOv5n
   :latency_requirement: 20ms
   :wit_interface: ai/object-detection.wit
   :bazel_target: //components/ai/object-detection
   :links: ADAS_REQ_007

   The object detection component shall process camera frames through YOLOv5n neural network
   to detect and classify objects within 20ms per frame at 1920x1080 resolution.

.. ai_comp:: Object Classification
   :id: AI_COMP_002
   :status: implemented
   :asil_level: B
   :component_category: ai
   :ai_model: YOLOv5n

   The component shall classify detected objects into safety-critical categories:
   vehicles (cars, trucks, buses), vulnerable road users (pedestrians, cyclists),
   and road infrastructure (traffic lights, signs, barriers).

.. ai_comp:: Detection Confidence Scoring
   :id: AI_COMP_003
   :status: implemented
   :asil_level: B
   :component_category: ai

   Each detected object shall include a confidence score (0.0-1.0) with configurable
   thresholds: safety-critical objects (0.7), informational objects (0.5).

.. ai_comp:: Bounding Box Accuracy
   :id: AI_COMP_004
   :status: implemented
   :asil_level: B
   :component_category: ai
   :ai_model: YOLOv5n

   Object bounding boxes shall maintain 90% IoU (Intersection over Union) accuracy
   compared to ground truth for objects within 50m range.

Neural Network Integration
~~~~~~~~~~~~~~~~~~~~~~~~~~

.. ai_comp:: WASI-NN Integration
   :id: AI_COMP_005
   :status: implemented
   :asil_level: B
   :component_category: ai
   :ai_model: YOLOv5n
   :wit_interface: wasi/nn.wit

   The component shall use WASI-NN APIs for neural network inference, supporting
   ONNX model format with quantized INT8 operations for efficiency.

.. ai_comp:: Model Hot Reload
   :id: AI_COMP_006
   :status: implemented
   :asil_level: QM
   :component_category: ai

   The component shall support loading updated AI models without system restart,
   enabling over-the-air improvements to detection algorithms.

.. ai_comp:: Hardware Acceleration
   :id: AI_COMP_007
   :status: implemented
   :asil_level: B
   :component_category: ai
   :latency_requirement: 15ms

   When available, the component shall utilize hardware acceleration (GPU, NPU)
   through WASI-NN, reducing inference latency to under 15ms.

Behavior Prediction Requirements
--------------------------------

.. ai_comp:: Trajectory Prediction
   :id: AI_COMP_008
   :status: implemented
   :asil_level: B
   :component_category: ai
   :latency_requirement: 30ms
   :wit_interface: ai/behavior-prediction.wit
   :bazel_target: //components/ai/behavior-prediction

   The behavior prediction component shall predict future trajectories for detected
   objects up to 5 seconds with 0.5-second intervals, updating at 10Hz.

.. ai_comp:: Multi-Modal Prediction
   :id: AI_COMP_009
   :status: implemented
   :asil_level: B
   :component_category: ai

   The component shall generate multiple possible trajectories with probability
   distributions, accounting for different behavioral modes (lane following,
   lane change, turning).

.. ai_comp:: Context-Aware Prediction
   :id: AI_COMP_010
   :status: implemented
   :asil_level: B
   :component_category: ai

   Predictions shall incorporate contextual information including road geometry,
   traffic rules, and interaction with other road users for realistic behavior modeling.

Performance Requirements
------------------------

.. ai_comp:: Inference Throughput
   :id: AI_COMP_011
   :status: implemented
   :asil_level: B
   :component_category: ai
   :ai_model: YOLOv5n

   The object detection shall process minimum 30 FPS on target hardware,
   with graceful degradation to 15 FPS under high system load.

.. ai_comp:: Memory Efficiency
   :id: AI_COMP_012
   :status: implemented
   :asil_level: B
   :component_category: ai
   :links: ADAS_REQ_012

   AI components shall operate within 256MB memory allocation including
   model weights, inference buffers, and working memory.

.. ai_comp:: Power Optimization
   :id: AI_COMP_013
   :status: implemented
   :asil_level: QM
   :component_category: ai

   Components shall support variable inference rates based on vehicle speed:
   highway (30 FPS), urban (20 FPS), parking (10 FPS) to optimize power consumption.

Safety and Reliability
----------------------

.. ai_comp:: Inference Monitoring
   :id: AI_COMP_014
   :status: implemented
   :asil_level: B
   :component_category: ai
   :links: SAFETY_001

   The component shall monitor inference health including timing violations,
   memory errors, and anomalous outputs with fail-safe fallback behavior.

.. ai_comp:: Model Validation
   :id: AI_COMP_015
   :status: implemented
   :asil_level: B
   :component_category: ai
   :ai_model: YOLOv5n

   AI models shall be validated against automotive datasets with minimum
   95% precision and 90% recall for safety-critical object classes.

Data Processing Requirements
----------------------------

.. ai_comp:: Input Preprocessing
   :id: AI_COMP_016
   :status: implemented
   :asil_level: B
   :component_category: ai
   :latency_requirement: 5ms

   Image preprocessing including resizing, normalization, and format conversion
   shall complete within 5ms to maintain real-time performance.

.. ai_comp:: Output Post-processing
   :id: AI_COMP_017
   :status: implemented
   :asil_level: B
   :component_category: ai
   :latency_requirement: 5ms

   Post-processing including NMS (Non-Maximum Suppression), coordinate transformation,
   and filtering shall complete within 5ms per frame.

.. ai_comp:: Temporal Consistency
   :id: AI_COMP_018
   :status: implemented
   :asil_level: B
   :component_category: ai

   Detection and prediction outputs shall maintain temporal consistency across
   frames using tracking IDs and smoothing filters.

Integration Requirements
------------------------

.. ai_comp:: Sensor Fusion Interface
   :id: AI_COMP_019
   :status: implemented
   :asil_level: B
   :component_category: ai
   :wit_interface: fusion/ai-fusion.wit
   :links: SENSOR_018

   AI components shall provide standardized outputs compatible with sensor
   fusion algorithms including uncertainty estimates and coordinate systems.

.. ai_comp:: Debug Visualization
   :id: AI_COMP_020
   :status: implemented
   :asil_level: QM
   :component_category: ai
   :wit_interface: debug/visualization.wit

   Components shall support debug visualization outputs showing bounding boxes,
   trajectories, and confidence scores for development and validation.

Requirements Summary
--------------------

.. needflow::
   :types: ai_comp
   :show_filters:
   :show_legend:

.. needtable::
   :types: ai_comp
   :columns: id, title, ai_model, latency_requirement, asil_level
   :style: table
   :sort: id
