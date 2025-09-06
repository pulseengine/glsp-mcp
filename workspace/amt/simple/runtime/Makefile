CXX ?= c++
RM ?= rm -f
BUILD_TYPE ?= debug
LIB_TYPE ?= shared

LIB_PREFIX = lib
LIB_SUFFIX_shared = .so
LIB_SUFFIX_static = .a
LIB_SUFFIX = $(LIB_SUFFIX_$(LIB_TYPE))

OUTBIN = runtime

EXTRA_FLAGS_static = -static-libgcc -static-libstdc++
EXTRA_FLAGS_shared =
EXTRA_FLAGS = $(EXTRA_FLAGS_$(LIB_TYPE)) -pie -fPIE

all: $(OUTBIN)

# Compile individual sources to object files.

%.cpp.o: %.cpp
	$(CXX) -c -o $@ $^ $(CXXFLAGS) $(EXTRA_CXXFLAGS) $(EXTRA_FLAGS)

# Build the runtime while linking against the individual components

$(OUTBIN): gen/src/runtime.cpp.o src/main.cpp.o
	$(CXX) -o $@  $^  $(LDFLAGS) $(EXTRA_LDFLAGS) $(EXTRA_FLAGS) \
		$(CURDIR)/../mesh/libmesh$(LIB_SUFFIX) \
		$(CURDIR)/../comp-a/libcomponent_a$(LIB_SUFFIX) \
		$(CURDIR)/../comp-b/libcomponent_b$(LIB_SUFFIX)

format:
	clang-format -i -style=file src/main.cpp

format-check:
	clang-format -n -Werror -style=file src/main.cpp

clean:
	$(RM) $(OUTBIN) gen/src/*.o src/*.o

# Only echo commands with var V set to non-empty
$(V).SILENT:
