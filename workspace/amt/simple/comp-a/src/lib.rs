#[rustfmt::skip]
#[path = "../gen/src/component_a.rs"]
mod component_a;
use component_a::component_a_goodies;
use component_a::exports::component_a_inter;
use component_a::exports::component_a_main;

struct Component {}

impl component_a_main::Guest for Component {
    fn run() -> bool {
        let r = component_a_goodies::Rec {
            a: 0xDEADBEEFu32,
            b: 125i8,
        };
        component_a_goodies::print(r);
        true
    }

    fn print_vec(vec: Vec<u8>) -> Vec<u8> {
        println!("a: {:?}", vec);
        vec
    }
}

impl component_a_inter::Guest for Component {
    fn add(r: component_a_inter::Rec) -> u32 {
        r.a + r.b
    }
    fn passthru(r: component_a_inter::Rec) -> component_a_inter::Rec {
        r
    }
}

component_a::export!(Component with_types_in component_a);
