"""
Shared Bazel macros for ADAS WebAssembly components using rules_wasm_component.

These macros reduce duplication and standardize component builds across the ADAS system.
"""

load("@rules_wasm_component//rust:defs.bzl", "rust_wasm_component_bindgen", "rust_wasm_component_test")
load("@rules_wasm_component//wit:defs.bzl", "wit_library")
load("@rules_wasm_component//wac:defs.bzl", "wac_compose")

def adas_component(
    name,
    srcs,
    wit_world,
    package_name = None,
    deps = [],
    wit_deps = [],
    extra_srcs = [],
    **kwargs):
    """
    Standard ADAS component build with consistent configuration.

    Args:
        name: Component name
        srcs: Rust source files
        wit_world: Path to WIT world file
        package_name: WIT package name (defaults to "adas:{name}")
        deps: Additional Rust dependencies
        wit_deps: Additional WIT dependencies
        extra_srcs: Additional source files
        **kwargs: Additional arguments passed to rust_wasm_component_bindgen
    """

    if not package_name:
        package_name = "adas:{}".format(name.replace("_", "-"))

    # Create WIT library for the component
    wit_library(
        name = name + "_wit",
        srcs = [wit_world],
        deps = wit_deps,
        package_name = package_name,
    )

    # Standard component dependencies (simplified)
    standard_deps = deps

    # Build the component
    rust_wasm_component_bindgen(
        name = name,
        srcs = srcs + extra_srcs,
        wit = ":" + name + "_wit",
        deps = standard_deps,
        profiles = ["debug", "release", "optimized"],
        crate_features = kwargs.pop("crate_features", []),
        **kwargs
    )

    # Add test target
    rust_wasm_component_test(
        name = name + "_test",
        component = ":" + name,
    )

def adas_ai_component(
    name,
    srcs,
    wit_world,
    model_files = [],
    **kwargs):
    """
    AI component with WASI-NN integration and model embedding.

    Args:
        name: Component name
        srcs: Rust source files
        wit_world: Path to WIT world file (should import wasi:nn)
        model_files: ONNX or other model files to embed
        **kwargs: Additional arguments passed to adas_component
    """

    # AI-specific WIT dependencies
    ai_wit_deps = kwargs.pop("wit_deps", []) + [
        "//wit/wasi-nn:wasi_nn_interfaces",
    ]

    # AI-specific Rust dependencies
    ai_deps = kwargs.pop("deps", []) + [
        "//adas-build/wasi-nn:lib",
    ]

    # Model files should be data dependencies, not source files
    data_deps = kwargs.pop("data", []) + model_files

    adas_component(
        name = name,
        srcs = srcs,
        wit_world = wit_world,
        deps = ai_deps,
        wit_deps = ai_wit_deps,
        data = data_deps,
        crate_features = ["wasi-nn"],
        **kwargs
    )

def adas_sensor_component(
    name,
    srcs,
    wit_world,
    sensor_type = "generic",
    **kwargs):
    """
    Sensor component with standard sensor interfaces and data flow.

    Args:
        name: Component name
        srcs: Rust source files
        wit_world: Path to WIT world file
        sensor_type: Type of sensor (camera, radar, lidar, ultrasonic)
        **kwargs: Additional arguments passed to adas_component
    """

    # Sensor-specific WIT dependencies
    sensor_wit_deps = kwargs.pop("wit_deps", []) + [
        "//wit/interfaces/adas-data:data",
        "//wit/interfaces/adas-diagnostics:diagnostics",
    ]

    # Sensor-specific dependencies based on type
    sensor_deps = kwargs.pop("deps", [])
    if sensor_type in ["camera"]:
        sensor_deps.append("@workspace//image")

    adas_component(
        name = name,
        srcs = srcs,
        wit_world = wit_world,
        deps = sensor_deps,
        wit_deps = sensor_wit_deps,
        **kwargs
    )

def adas_system_component(
    name,
    srcs,
    wit_world,
    safety_critical = False,
    **kwargs):
    """
    System component with diagnostics and optional safety features.

    Args:
        name: Component name
        srcs: Rust source files
        wit_world: Path to WIT world file
        safety_critical: Enable additional safety validations
        **kwargs: Additional arguments passed to adas_component
    """

    # System-specific WIT dependencies
    system_wit_deps = kwargs.pop("wit_deps", []) + [
        "//wit/interfaces/adas-system:system",
        "//wit/interfaces/adas-diagnostics:diagnostics",
    ]

    # Safety-critical features
    crate_features = kwargs.pop("crate_features", [])
    if safety_critical:
        crate_features.append("safety-critical")

    adas_component(
        name = name,
        srcs = srcs,
        wit_world = wit_world,
        wit_deps = system_wit_deps,
        crate_features = crate_features,
        **kwargs
    )

def adas_component_group(
    name,
    components,
    composition_file = None,
    profile = "release",
    use_symlinks = True,
    **kwargs):
    """
    Group multiple ADAS components into a composed system.

    Args:
        name: Group name
        components: Dictionary of component name -> target mappings
        composition_file: WAC composition file (defaults to name.wac)
        profile: Build profile (debug, release, optimized)
        use_symlinks: Use symlinks for faster development builds
        **kwargs: Additional arguments passed to wac_compose
    """

    if not composition_file:
        composition_file = name + ".wac"

    wac_compose(
        name = name,
        components = components,
        composition_file = composition_file,
        profile = profile,
        use_symlinks = use_symlinks,
        **kwargs
    )

def adas_test_suite(
    name,
    components,
    integration_tests = [],
    **kwargs):
    """
    Create a comprehensive test suite for ADAS components.

    Args:
        name: Test suite name
        components: List of component targets to test
        integration_tests: Additional integration test targets
        **kwargs: Additional arguments
    """

    all_tests = []

    # Add individual component tests
    for component in components:
        all_tests.append(component + "_test")

    # Add integration tests
    all_tests.extend(integration_tests)

    # Create test suite target
    native.test_suite(
        name = name,
        tests = all_tests,
        **kwargs
    )

# Convenience aliases for common component patterns
def adas_camera_component(name, srcs, wit_world, **kwargs):
    """Camera sensor component with image processing."""
    return adas_sensor_component(
        name = name,
        srcs = srcs,
        wit_world = wit_world,
        sensor_type = "camera",
        **kwargs
    )

def adas_radar_component(name, srcs, wit_world, **kwargs):
    """Radar sensor component with point cloud processing."""
    return adas_sensor_component(
        name = name,
        srcs = srcs,
        wit_world = wit_world,
        sensor_type = "radar",
        **kwargs
    )

def adas_lidar_component(name, srcs, wit_world, **kwargs):
    """LiDAR sensor component with 3D point cloud processing."""
    return adas_sensor_component(
        name = name,
        srcs = srcs,
        wit_world = wit_world,
        sensor_type = "lidar",
        **kwargs
    )

def adas_fusion_component(name, srcs, wit_world, **kwargs):
    """Data fusion component for multi-sensor integration."""
    fusion_wit_deps = kwargs.pop("wit_deps", []) + [
        "//wit/interfaces/adas-data:data",
        "//wit/interfaces/adas-control:control",
    ]

    return adas_component(
        name = name,
        srcs = srcs,
        wit_world = wit_world,
        wit_deps = fusion_wit_deps,
        **kwargs
    )

def adas_control_component(name, srcs, wit_world, **kwargs):
    """Control component for vehicle actuation."""
    control_wit_deps = kwargs.pop("wit_deps", []) + [
        "//wit/interfaces/adas-control:control",
        "//wit/interfaces/adas-system:system",
    ]

    return adas_component(
        name = name,
        srcs = srcs,
        wit_world = wit_world,
        wit_deps = control_wit_deps,
        safety_critical = True,
        **kwargs
    )
