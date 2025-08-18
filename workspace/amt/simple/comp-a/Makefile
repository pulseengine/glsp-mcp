CP ?= cp
CARGO ?= cargo
RM ?= rm -f
BUILD_TYPE ?= debug
CARGO_TARGET ?= x86_64-unknown-linux-gnu
LIB_TYPE ?= shared

LIB_PREFIX = lib
LIB_SUFFIX_shared = .so
LIB_SUFFIX_static = .a
LIB_SUFFIX = $(LIB_SUFFIX_$(LIB_TYPE))

LIBNAME = component_a
OUTLIB = $(LIB_PREFIX)$(LIBNAME)$(LIB_SUFFIX)

CARGO_BUILD_FLAGS_debug =
CARGO_BUILD_FLAGS_release = --release
CARGO_BUILD_FLAGS = \
	$(CARGO_BUILD_FLAGS_$(BUILD_TYPE)) \
	--target $(CARGO_TARGET)

RUSTFLAGS_static = -Ctarget-feature=+crt-static
RUSTFLAGS_shared = -Ctarget-feature=-crt-static
export RUSTFLAGS += $(RUSTFLAGS_$(LIB_TYPE)) -Crelocation-model=pic

.PHONY: build clean

all: $(OUTLIB)

build:
	+$(CARGO) build $(CARGO_BUILD_FLAGS)

$(OUTLIB): build
	$(CP) target/$(CARGO_TARGET)/$(BUILD_TYPE)/$@ $@

format:
	cargo fmt

format-check:
	cargo fmt --check

clean:
	$(CARGO) clean
	$(RM) $(LIB_PREFIX)$(LIBNAME)$(LIB_SUFFIX_shared) $(LIB_PREFIX)$(LIBNAME)$(LIB_SUFFIX_static)

# Only echo commands with var V set to non-empty
$(V).SILENT:
