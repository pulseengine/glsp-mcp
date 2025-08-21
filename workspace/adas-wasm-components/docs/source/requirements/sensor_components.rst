Sensor Component Requirements
=============================

This document specifies requirements for the sensor components in the ADAS system, including cameras, LiDAR, radar, and ultrasonic sensors.

.. contents::
   :local:
   :depth: 2

Overview
--------

The ADAS system includes six sensor components that provide environmental perception capabilities:

* 2 Camera components (front-facing and surround view)
* 1 LiDAR component for 3D point cloud generation
* 2 Radar components (front long-range and corner short-range)
* 1 Ultrasonic component for close-proximity detection

Camera Component Requirements
-----------------------------

Front Camera Requirements
~~~~~~~~~~~~~~~~~~~~~~~~~

.. sensor_req:: Front Camera Data Acquisition
   :id: SENSOR_001
   :status: implemented
   :sensor_type: camera
   :asil_level: B
   :component_category: sensor
   :wit_interface: sensors/camera.wit
   :bazel_target: //components/sensors/camera-front

   The front camera component shall capture video frames at 1920x1080 resolution at 30 FPS,
   providing RGB data in YUV420 format for object detection processing.

.. sensor_req:: Front Camera Field of View
   :id: SENSOR_002
   :status: implemented
   :sensor_type: camera
   :asil_level: B
   :component_category: sensor

   The front camera shall provide a minimum 120-degree horizontal field of view with
   distortion correction applied to maintain object detection accuracy.

.. sensor_req:: Front Camera Low Light Performance
   :id: SENSOR_003
   :status: implemented
   :sensor_type: camera
   :asil_level: B
   :component_category: sensor
   :latency_requirement: 33ms

   The front camera component shall support HDR processing and low-light enhancement,
   maintaining object detection capability down to 0.1 lux illumination.

.. sensor_req:: Front Camera Timestamp Synchronization
   :id: SENSOR_004
   :status: implemented
   :sensor_type: camera
   :asil_level: B
   :component_category: sensor

   Each camera frame shall include high-precision timestamps (microsecond accuracy) synchronized
   with the vehicle's master clock for sensor fusion alignment.

.. sensor_req:: Front Camera Failure Detection
   :id: SENSOR_005
   :status: implemented
   :sensor_type: camera
   :asil_level: B
   :component_category: sensor
   :links: ADAS_REQ_009

   The camera component shall detect and report sensor failures including lens obstruction,
   image freezing, and communication errors within 100ms of occurrence.

Surround Camera Requirements
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. sensor_req:: Surround Camera Array
   :id: SENSOR_006
   :status: implemented
   :sensor_type: camera
   :asil_level: QM
   :component_category: sensor
   :wit_interface: sensors/camera.wit
   :bazel_target: //components/sensors/camera-surround

   The surround camera component shall process data from four cameras (front, rear, left, right)
   providing 360-degree coverage around the vehicle for parking assistance.

.. sensor_req:: Surround View Stitching
   :id: SENSOR_007
   :status: implemented
   :sensor_type: camera
   :asil_level: QM
   :component_category: sensor
   :latency_requirement: 100ms

   The component shall stitch individual camera feeds into a unified bird's-eye view within
   100ms, with seamless blending at overlap regions.

LiDAR Component Requirements
----------------------------

.. sensor_req:: LiDAR Point Cloud Generation
   :id: SENSOR_008
   :status: implemented
   :sensor_type: lidar
   :asil_level: B
   :component_category: sensor
   :wit_interface: sensors/lidar.wit
   :bazel_target: //components/sensors/lidar

   The LiDAR component shall process 3D point cloud data at 10Hz with a minimum of 100,000
   points per frame, covering a 360-degree horizontal and 40-degree vertical field of view.

.. sensor_req:: LiDAR Range Detection
   :id: SENSOR_009
   :status: implemented
   :sensor_type: lidar
   :asil_level: B
   :component_category: sensor

   The LiDAR shall detect objects from 0.5m to 200m with range accuracy of ±2cm and
   reflectivity information for each point.

.. sensor_req:: LiDAR Data Filtering
   :id: SENSOR_010
   :status: implemented
   :sensor_type: lidar
   :asil_level: B
   :component_category: sensor
   :latency_requirement: 50ms

   The component shall apply real-time filtering to remove noise, rain, and dust particles
   while preserving relevant obstacle information within 50ms processing time.

Radar Component Requirements
----------------------------

Front Radar Requirements
~~~~~~~~~~~~~~~~~~~~~~~~

.. sensor_req:: Front Radar Long Range Detection
   :id: SENSOR_011
   :status: implemented
   :sensor_type: radar
   :asil_level: B
   :component_category: sensor
   :wit_interface: sensors/radar.wit
   :bazel_target: //components/sensors/radar-front

   The front radar shall detect objects up to 250m range with velocity measurement accuracy
   of ±0.1 m/s for adaptive cruise control and collision avoidance.

.. sensor_req:: Front Radar Target Tracking
   :id: SENSOR_012
   :status: implemented
   :sensor_type: radar
   :asil_level: B
   :component_category: sensor

   The radar shall simultaneously track up to 64 targets with position, velocity, and
   acceleration information updated at 20Hz.

.. sensor_req:: Front Radar Weather Immunity
   :id: SENSOR_013
   :status: implemented
   :sensor_type: radar
   :asil_level: B
   :component_category: sensor

   The radar component shall maintain detection performance in adverse weather conditions
   including heavy rain, snow, and fog where optical sensors are degraded.

Corner Radar Requirements
~~~~~~~~~~~~~~~~~~~~~~~~~

.. sensor_req:: Corner Radar Blind Spot Detection
   :id: SENSOR_014
   :status: implemented
   :sensor_type: radar
   :asil_level: B
   :component_category: sensor
   :wit_interface: sensors/radar.wit
   :bazel_target: //components/sensors/radar-corner

   Corner radar components shall provide blind spot monitoring with 150-degree field of view
   and 50m range for lane change assistance.

.. sensor_req:: Corner Radar Cross Traffic Alert
   :id: SENSOR_015
   :status: implemented
   :sensor_type: radar
   :asil_level: B
   :component_category: sensor
   :latency_requirement: 50ms

   The radar shall detect cross-traffic when reversing with object classification
   (vehicle, pedestrian, cyclist) within 50ms for parking safety.

Ultrasonic Component Requirements
---------------------------------

.. sensor_req:: Ultrasonic Proximity Detection
   :id: SENSOR_016
   :status: implemented
   :sensor_type: ultrasonic
   :asil_level: QM
   :component_category: sensor
   :wit_interface: sensors/ultrasonic.wit
   :bazel_target: //components/sensors/ultrasonic

   The ultrasonic component shall process data from 12 sensors providing 360-degree
   close-range coverage from 0.2m to 5m for parking assistance.

.. sensor_req:: Ultrasonic Array Synchronization
   :id: SENSOR_017
   :status: implemented
   :sensor_type: ultrasonic
   :asil_level: QM
   :component_category: sensor

   The component shall synchronize ultrasonic sensor firing to avoid cross-talk
   while maintaining 10Hz update rate for all sensors.

Sensor Fusion Requirements
--------------------------

.. sensor_req:: Multi-Sensor Calibration
   :id: SENSOR_018
   :status: implemented
   :sensor_type: all
   :asil_level: B
   :component_category: sensor
   :links: ADAS_REQ_006

   All sensor components shall support extrinsic calibration with sub-centimeter accuracy
   for proper sensor fusion alignment in 3D space.

.. sensor_req:: Sensor Data Quality Metrics
   :id: SENSOR_019
   :status: implemented
   :sensor_type: all
   :asil_level: B
   :component_category: sensor

   Each sensor component shall provide data quality metrics including confidence scores,
   SNR measurements, and degradation indicators for fusion weighting.

.. sensor_req:: Time Synchronization Protocol
   :id: SENSOR_020
   :status: implemented
   :sensor_type: all
   :asil_level: B
   :component_category: sensor

   All sensors shall support PTP (Precision Time Protocol) for sub-millisecond
   synchronization across the distributed ADAS system.

Requirements Summary
--------------------

.. needflow::
   :types: sensor_req
   :show_filters:
   :show_legend:

.. needtable::
   :types: sensor_req
   :columns: id, title, sensor_type, asil_level, status
   :style: table
