# WIT Composition Project

This project demonstrates the composition of WebAssembly Interface Types (WIT) definitions using `math.wit`, `user.wit`, and `world.wit`. The project provides a clear example of how multiple WIT definitions can interact and be composed in Rust using the WebAssembly component model.

## Project Structure

```
wit-composition-project/
├── wit/
│   ├── math.wit
│   ├── user.wit
│   └── world.wit
└── src/
    └── lib.rs
```

## WIT Interfaces

### math.wit

Defines basic mathematical operations.

```wit
interface math {
  add: func(a: f32, b: f32) -> f32
  subtract: func(a: f32, b: f32) -> f32
  multiply: func(a: f32, b: f32) -> f32
  divide: func(a: f32, b: f32) -> result<f32, string>
}
```

### user.wit

Defines user-related functionality.

```wit
interface user {
  record User {
    id: u32,
    name: string,
  }

  get-user: func(id: u32) -> option<User>
  create-user: func(name: string) -> User
}
```

### world.wit

Composes the interfaces and defines the main entry point.

```wit
world world {
  import math
  import user

  export greet-user: func(id: u32) -> string
  export calculate-and-greet: func(id: u32, a: f32, b: f32) -> string
}
```

## Rust Implementation (`src/lib.rs`)

The Rust library provides implementations for the composed WIT interfaces.

```rust
use wit_bindgen::generate;

// Generate Rust bindings from WIT definitions
generate!("world");

struct UserService;
struct MathService;

impl world::user::User for UserService {
    fn get_user(id: u32) -> Option<world::user::User> {
        Some(world::user::User { id, name: format!("User{id}") })
    }

    fn create_user(name: String) -> world::user::User {
        world::user::User { id: 1, name }
    }
}

impl world::math::Math for MathService {
    fn add(a: f32, b: f32) -> f32 { a + b }
    fn subtract(a: f32, b: f32) -> f32 { a - b }
    fn multiply(a: f32, b: f32) -> f32 { a * b }

    fn divide(a: f32, b: f32) -> Result<f32, String> {
        if b == 0.0 {
            Err("Cannot divide by zero".into())
        } else {
            Ok(a / b)
        }
    }
}

pub struct Component;

impl world::World for Component {
    fn greet_user(id: u32) -> String {
        match UserService::get_user(id) {
            Some(user) => format!("Hello, {}!", user.name),
            None => "User not found".into(),
        }
    }

    fn calculate_and_greet(id: u32, a: f32, b: f32) -> String {
        match MathService::divide(a, b) {
            Ok(result) => format!("Hello User{}, the result is {:.2}", id, result),
            Err(e) => format!("Calculation error: {}", e),
        }
    }
}
```

## Usage

Compile the project using Cargo with WASM support:

```bash
cargo build --target wasm32-unknown-unknown --release
```

## Tools and Dependencies

* Rust
* WebAssembly Interface Types (WIT)
* `wit-bindgen` for Rust bindings generation

## License

MIT License

