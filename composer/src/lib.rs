wit_bindgen::generate!({
    path: "../wit",
    world: "math",
    exports: {
        generate_all,
    }
});

pub struct Math;

impl Math {
    pub fn add_points(p1: bindings::Point, p2: bindings::Point) -> bindings::Point {
        bindings::Point {
            x: p1.x + p2.x,
            y: p1.y + p2.y,
        }
    }
}

pub fn compose_points(p1: bindings::Point, p2: bindings::Point) -> bindings::Point {
    Math::add_points(p1, p2)
}
