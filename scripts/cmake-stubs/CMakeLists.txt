# Dummy CMakeLists.txt for React Native modules with codegen issues in CI
# This creates stub libraries to satisfy CMake autolinking without requiring
# the codegen artifacts that don't exist before the build starts.
cmake_minimum_required(VERSION 3.13)

# Create a dummy source file
set(DUMMY_SOURCE ${CMAKE_CURRENT_BINARY_DIR}/stub.cpp)
file(WRITE ${DUMMY_SOURCE} "// Stub file for disabled codegen modules\n")

# Create stub libraries only if they don't already exist
if(NOT TARGET react_codegen_RNDateTimePickerCGen)
  add_library(react_codegen_RNDateTimePickerCGen STATIC ${DUMMY_SOURCE})
  set_target_properties(react_codegen_RNDateTimePickerCGen PROPERTIES LINKER_LANGUAGE CXX)
endif()

if(NOT TARGET react_codegen_rngesturehandler_codegen)
  add_library(react_codegen_rngesturehandler_codegen STATIC ${DUMMY_SOURCE})
  set_target_properties(react_codegen_rngesturehandler_codegen PROPERTIES LINKER_LANGUAGE CXX)
endif()
