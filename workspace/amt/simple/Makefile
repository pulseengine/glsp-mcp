AMT_COMPOSE ?= amt-compose
CXX ?= c++
BUILD_TYPE ?= debug
LIB_TYPE ?= shared
EXTRA_CXXFLAGS_debug ?= -g -O0
EXTRA_CXXFLAGS_release ?= -O3
EXTRA_LDFLAGS_debug ?=
EXTRA_LDFLAGS_release ?= -Wl,--gc-sections

LIB_SUFFIX_static = .a
LIB_SUFFIX_shared = .so

export BUILD_TYPE
export LIB_TYPE
LIB_SUFFIX = $(LIB_SUFFIX_$(LIB_TYPE))
export EXTRA_CXXFLAGS += $(EXTRA_CXXFLAGS_$(BUILD_TYPE)) -isystem $(CURDIR)/include -std=c++17 -fstack-protector-all
export EXTRA_LDFLAGS += $(EXTRA_LDFLAGS_$(BUILD_TYPE))

COMP_A = comp-a/libcomponent_a$(LIB_SUFFIX)
COMP_B = comp-b/libcomponent_b$(LIB_SUFFIX)
MESH = mesh/libmesh$(LIB_SUFFIX)
RUNTIME = runtime/runtime

RUNTIME_DIR = runtime
RUNTIME_EXE = runtime
RUNTIME = $(RUNTIME_DIR)/$(RUNTIME_EXE)

LLVM_PROFILE_FILE = coverage.profraw
LLVM_PROFDATA_FILE = coverage.profdata
LCOV_PATH ?=
COV_IGNORE_ARGS ?= --ignore-filename-regex=/.deps/ --ignore-filename-regex=^/usr/local/ --ignore-filename-regex=^/rustc/

all: $(RUNTIME)

# Build individual components

.PHONY: $(COMP_A) $(COMP_B) $(MESH) run clean selftest coverage

$(COMP_A):
	@echo "Building Component A"
	+$(SUBMAKE) -C comp-a
	@echo "Built Component A"

$(COMP_B):
	@echo "Building Component B"
	+$(SUBMAKE) -C comp-b
	@echo "Built Component B"

$(MESH):
	@echo "Building Mesh"
	+$(SUBMAKE) -C mesh
	@echo "Built Mesh"

# Build the runtime executable and print section sizes

$(RUNTIME): $(COMP_A) $(COMP_B) $(MESH)
	@echo "Building Runtime"
	+$(SUBMAKE) -C runtime
	@echo "Built Runtime"
	@test "$(LIB_TYPE)" = "static" && size -t -G $@ || true
	@test "$(LIB_TYPE)" = "shared" && size -t -G $@ $^ || true

# Run executable from its own directory so ACF config file is found.

run: $(RUNTIME)
	echo "Running the application (path: $(RUNTIME))..."
	cd $(shell dirname $(RUNTIME)) && ./$(shell basename $(RUNTIME))
	@echo "The application has exited."

coverage:
	@echo "Checking version compatiblity..."
	CLANG_MAJOR_VERSION=$$($(CXX) --version | grep -oP 'clang version \K[0-9]+');\
	RUST_COV_VERSION=$$(rust-cov --version | grep -oP 'LLVM version \K[0-9]+');\
	if [ -z "$$CLANG_MAJOR_VERSION" ]; then \
		echo "Failed to determine Clang/LLVM version";\
		exit 1 ;\
	elif [ -z "$$RUST_COV_VERSION" ]; then \
		echo "Failed to determine Clang/LLVM version";\
		exit 1 ;\
	fi; \
	if [ "$$CLANG_MAJOR_VERSION" -ne "$$RUST_COV_VERSION" ]; then \
		echo "Clang (LLVM $${CLANG_MAJOR_VERSION}) and rust-cov (LLVM $${RUST_COV_VERSION}) are incompatible.";\
		exit 1;\
	fi ;\
	echo "Clang (LLVM $${CLANG_MAJOR_VERSION}) and rust-cov (LLVM $${RUST_COV_VERSION}) are compatible.";\
	echo "Running coverage build.."

	+$(SUBMAKE) clean
	+ RUSTFLAGS="$${RUSTFLAGS} -C instrument-coverage" \
	CXXFLAGS="$${CXXFLAGS} -fprofile-instr-generate -fcoverage-mapping" \
	LDFLAGS="$${LDFLAGS} -fprofile-instr-generate -fcoverage-mapping" \
	LLVM_PROFILE_FILE=$(LLVM_PROFILE_FILE) $(SUBMAKE) run
	@echo "Generating Coverage report..."
	rust-profdata merge -sparse $(RUNTIME_DIR)/$(LLVM_PROFILE_FILE) -o $(RUNTIME_DIR)/$(LLVM_PROFDATA_FILE) \
	&& rust-cov report --summary-only --instr-profile=$(RUNTIME_DIR)/$(LLVM_PROFDATA_FILE) ./$(RUNTIME) --object $(COMP_A) --object $(COMP_B) --object $(MESH) $(COV_IGNORE_ARGS)
	if [ -n "$(LCOV_PATH)" ]; then \
		rust-cov export ./$(RUNTIME) --object $(COMP_A) --object $(COMP_B) --object $(MESH)  $(COV_IGNORE_ARGS) -instr-profile=$(RUNTIME_DIR)/$(LLVM_PROFDATA_FILE) -format=lcov > "${LCOV_PATH}" ;\
	fi
	+$(SUBMAKE) clean

format:
	@echo "Formating Component A"
	+$(SUBMAKE) -C comp-a format
	@echo "Formatted Component A"

	@echo "Formating Component B"
	+$(SUBMAKE) -C comp-b format
	@echo "Formatted Component B"

	@echo "Formating runtime"
	+$(SUBMAKE) -C runtime format
	@echo "Formatted runtime"

format-check:
	@echo "Verify format of Component A"
	+$(SUBMAKE) -C comp-a format-check
	@echo "Verified format of Component A"

	@echo "Verify format of Component B"
	+$(SUBMAKE) -C comp-b format-check
	@echo "Verified format of Component B"

	@echo "Verify format of runtime"
	+$(SUBMAKE) -C runtime format-check
	@echo "Verified format of runtime"

clean:
	+$(SUBMAKE) -C comp-a clean
	+$(SUBMAKE) -C comp-b clean
	+$(SUBMAKE) -C mesh clean
	+$(SUBMAKE) -C runtime clean

selftest:
	@echo "Self-testing by building and running 4 flavors (debug|release, shared|static)"
	+$(SUBMAKE) clean
	+$(SUBMAKE) run BUILD_TYPE=debug LIB_TYPE=shared

	+$(SUBMAKE) clean
	+$(SUBMAKE) run BUILD_TYPE=debug LIB_TYPE=static

	+$(SUBMAKE) clean
	+$(SUBMAKE) run BUILD_TYPE=release LIB_TYPE=shared

	+$(SUBMAKE) clean
	+$(SUBMAKE) run BUILD_TYPE=release LIB_TYPE=static
	@echo "Self-testing finished successfully."

generate:
	$(AMT_COMPOSE) --project "$(CURDIR)" build

# Only echo commands with var V set to non-empty
$(V).SILENT:
$(V)SOPT = -s
SUBMAKE = $(MAKE) $(SOPT)
