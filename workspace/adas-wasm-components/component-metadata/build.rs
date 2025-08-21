/// Build script for generating component metadata
/// This is only for the component-metadata crate itself

fn main() {
    // For the component-metadata crate, we don't need to generate metadata
    // This build.rs is just a placeholder
    println!("cargo:rerun-if-changed=build.rs");
}
