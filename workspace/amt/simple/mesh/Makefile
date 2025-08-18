AR ?= ar
CXX ?= c++
RM ?= rm -f
BUILD_TYPE ?= debug
LIB_TYPE ?= shared

LIB_PREFIX = lib
LIB_SUFFIX_shared = .so
LIB_SUFFIX_static = .a
LIB_SUFFIX = $(LIB_SUFFIX_$(LIB_TYPE))

EXTRA_FLAGS = -fPIC
LIBNAME = mesh
OUTLIB = $(LIB_PREFIX)$(LIBNAME)$(LIB_SUFFIX)

all: $(OUTLIB)

# Compile individual sources to object files.

%.cpp.o: %.cpp
	$(CXX) -c -o $@ $^ $(CXXFLAGS) $(EXTRA_CXXFLAGS) $(EXTRA_FLAGS)

# Build either static (.a) or shared (.so) library from object files.

$(LIB_PREFIX)$(LIBNAME)$(LIB_SUFFIX_static): gen/src/mesh_native.cpp.o
	$(AR) -crs $@ $^

$(LIB_PREFIX)$(LIBNAME)$(LIB_SUFFIX_shared): gen/src/mesh_native.cpp.o
	$(CXX) -o $@ $^ -shared $(LDFLAGS) $(EXTRA_LDFLAGS) $(EXTRA_FLAGS)

clean:
	$(RM) $(LIB_PREFIX)$(LIBNAME)$(LIB_SUFFIX_shared) $(LIB_PREFIX)$(LIBNAME)$(LIB_SUFFIX_static) gen/src/*.o src/*.o

# Only echo commands with var V set to non-empty
$(V).SILENT:
