Simulation and Testing Architecture
===================================

This section describes the simulation framework and testing architecture implemented in GLSP-MCP, including pipeline execution, component composition, and sensor data integration.

.. contents::
   :local:
   :depth: 2

Overview
--------

The GLSP-MCP platform includes a comprehensive simulation framework that enables:

* **Pipeline-based component execution** with dependency management
* **Time-driven simulation** with deterministic execution
* **Sensor data streaming** from database to components
* **Complex scenario orchestration** with multiple pipelines
* **Real-time and accelerated simulation modes**

Simulation Architecture
-----------------------

.. plantuml::
   :caption: Simulation Framework Architecture

   @startuml
   !theme plain
   skinparam componentStyle rectangle

   package "Simulation Framework" {
       [Simulation Engine] as engine
       [Pipeline Manager] as pipeline
       [Sensor Bridge] as bridge
       [Timing Controller] as timing
       [Resource Manager] as resource
       [Statistics Collector] as stats
   }

   package "WASM Components" {
       [Component A] as compA
       [Component B] as compB
       [Component C] as compC
   }

   database "Database Layer" {
       [PostgreSQL] as pg
       [InfluxDB] as influx
       [Redis Cache] as redis
   }

   engine --> pipeline : Manages
   engine --> timing : Controls
   pipeline --> compA : Executes
   pipeline --> compB : Executes
   pipeline --> compC : Executes

   bridge --> influx : Queries
   bridge --> redis : Caches
   bridge --> compA : Streams data
   bridge --> compB : Streams data

   timing --> bridge : Synchronizes
   resource --> compA : Limits
   resource --> compB : Limits
   resource --> compC : Limits

   stats --> engine : Collects metrics
   @enduml

Pipeline Execution Model
------------------------

The pipeline execution model enables complex component compositions:

.. plantuml::
   :caption: Pipeline Execution Flow

   @startuml
   !theme plain

   start

   :Load Pipeline Configuration;
   :Validate Component Dependencies;

   partition "Initialization Phase" {
       :Load WASM Components;
       :Security Scan Components;
       :Initialize Sensor Bridge;
       :Setup Resource Limits;
   }

   partition "Execution Phase" {
       while (Simulation Running?) is (yes)
           :Get Next Time Frame;
           :Query Sensor Data;

           fork
               :Execute Stage 1;
           fork again
               :Execute Stage 2;
           fork again
               :Execute Stage 3;
           end fork

           :Collect Results;
           :Update Statistics;

           if (Error Occurred?) then (yes)
               :Handle Error;
               :Log Diagnostics;
           endif
       endwhile (no)
   }

   :Generate Report;
   :Cleanup Resources;

   stop
   @enduml

Component Composition
---------------------

Components are composed into pipelines with explicit data flow:

.. code-block:: rust

   pub struct PipelineConfig {
       pub pipeline_id: String,
       pub name: String,
       pub stages: Vec<PipelineStage>,
       pub connections: Vec<DataConnection>,
       pub sensor_config: Option<SensorBridgeConfig>,
   }

   pub struct PipelineStage {
       pub stage_id: String,
       pub component_name: String,
       pub method: String,
       pub dependencies: Vec<String>,
       pub parallel_group: Option<String>,
   }

Data Flow Architecture
----------------------

.. plantuml::
   :caption: Sensor Data Flow in Simulation

   @startuml
   !theme plain

   participant "Database" as db
   participant "Sensor Bridge" as bridge
   participant "Buffer Manager" as buffer
   participant "Component A" as compA
   participant "Component B" as compB
   participant "Pipeline Engine" as engine

   == Initialization ==
   engine -> bridge : Configure sensors
   bridge -> db : Query metadata
   bridge -> buffer : Allocate buffers

   == Simulation Loop ==
   loop Every frame
       engine -> bridge : Request frame(t)
       bridge -> db : Query time range
       db --> bridge : Sensor readings
       bridge -> buffer : Buffer data

       par
           bridge -> compA : Stream data
           compA -> compA : Process
           compA --> engine : Results
       and
           bridge -> compB : Stream data
           compB -> compB : Process
           compB --> engine : Results
       end

       engine -> engine : Aggregate results
   end
   @enduml

Simulation Scenarios
--------------------

Complex scenarios with multiple pipelines:

.. plantuml::
   :caption: Multi-Pipeline Scenario Execution

   @startuml
   !theme plain

   package "Scenario: ADAS Simulation" {
       component "Sensor Pipeline" as sensor {
           [Camera Processing]
           [LiDAR Processing]
           [Radar Processing]
       }

       component "AI Pipeline" as ai {
           [Object Detection]
           [Behavior Prediction]
           [Sensor Fusion]
       }

       component "Control Pipeline" as control {
           [Path Planning]
           [Vehicle Control]
           [Safety Monitor]
       }
   }

   database "Sensor Database" as db

   db --> sensor : Time-series data
   sensor --> ai : Processed sensor data
   ai --> control : Perception results
   control --> [Actuator Commands]

   note right of ai
       Parallel execution
       within pipeline
   end note

   note bottom of control
       Sequential execution
       with safety checks
   end note
   @enduml

Timing and Synchronization
--------------------------

The simulation framework supports multiple timing modes:

1. **Real-time Mode**: Synchronized with wall clock time
2. **Accelerated Mode**: Faster than real-time for batch processing
3. **Stepped Mode**: Frame-by-frame execution for debugging
4. **Replay Mode**: Deterministic replay of recorded scenarios

.. code-block:: rust

   pub enum SyncMode {
       OriginalTimestamp,    // Use sensor timestamps
       SimulationTime,       // Use simulation clock
       FixedFrameRate,       // Fixed FPS
       RealTime,            // Wall clock sync
   }

Resource Management
-------------------

Each component execution is resource-constrained:

* **Memory Limits**: Per-component memory allocation
* **CPU Limits**: Execution time budgets
* **I/O Limits**: Network and disk access quotas
* **GPU Access**: WASI-NN acceleration when available

Testing Framework Integration
-----------------------------

.. plantuml::
   :caption: Testing Framework Architecture

   @startuml
   !theme plain

   package "Test Infrastructure" {
       [Test Runner] as runner
       [Scenario Generator] as generator
       [Result Validator] as validator
       [Performance Profiler] as profiler
   }

   package "Test Types" {
       [Unit Tests] as unit
       [Integration Tests] as integration
       [Simulation Tests] as simulation
       [Performance Tests] as perf
   }

   runner --> unit
   runner --> integration
   runner --> simulation
   runner --> perf

   generator --> simulation : Test scenarios
   simulation --> validator : Results
   simulation --> profiler : Metrics

   note right of simulation
       Uses same pipeline
       engine as production
   end note
   @enduml

Example: ADAS Component Testing
-------------------------------

A complete example of testing an ADAS system:

.. code-block:: yaml

   simulation:
     name: "ADAS Highway Scenario"
     scenarios:
       - name: "Highway Cruise"
         pipelines:
           - id: "sensor-pipeline"
             stages:
               - component: "camera-front"
                 method: "capture"
               - component: "radar-front"
                 method: "scan"
               - component: "lidar"
                 method: "sweep"

           - id: "perception-pipeline"
             stages:
               - component: "object-detection"
                 method: "detect"
                 dependencies: ["sensor-pipeline"]
               - component: "sensor-fusion"
                 method: "fuse"

           - id: "control-pipeline"
             stages:
               - component: "path-planning"
                 method: "plan"
                 dependencies: ["perception-pipeline"]
               - component: "vehicle-control"
                 method: "control"

     sensor_config:
       dataset_id: "highway-test-data"
       timing:
         playback_speed: 1.0
         target_fps: 30

     settings:
       timeout_seconds: 300
       resource_limits:
         max_memory_mb: 4096
         max_cpu_percent: 80

Performance Monitoring
----------------------

The simulation framework collects comprehensive metrics:

* **Component Metrics**: Execution time, memory usage, I/O operations
* **Pipeline Metrics**: Stage latencies, data flow rates
* **System Metrics**: Overall throughput, resource utilization
* **Quality Metrics**: Accuracy, precision, recall for AI components

Best Practices
--------------

1. **Component Isolation**: Each component runs in its own sandbox
2. **Deterministic Execution**: Same inputs produce same outputs
3. **Error Handling**: Graceful degradation on component failure
4. **Performance Budgets**: Define timing constraints upfront
5. **Test Data Management**: Version control for test datasets

Integration with CI/CD
----------------------

The simulation framework integrates with continuous integration:

.. code-block:: bash

   # Run simulation tests in CI
   cargo test --features simulation

   # Run performance benchmarks
   cargo bench --features simulation

   # Generate test report
   cargo xtask test-report

Future Enhancements
-------------------

Planned improvements to the simulation framework:

* **Distributed Simulation**: Multi-node execution for large scenarios
* **Hardware-in-Loop**: Integration with physical sensors
* **Cloud Simulation**: Scalable simulation in cloud environments
* **ML-based Testing**: Automatic test scenario generation
