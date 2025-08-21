/// Build script for camera-front component
/// Generates metadata that gets embedded into the WASM binary

fn main() {
    // Use the component-metadata crate to generate metadata.json
    // This will be embedded into the component at compile time
    component_metadata::build::generate_metadata();
}
