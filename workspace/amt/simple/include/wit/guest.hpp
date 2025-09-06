#pragma once

#include <cstdlib>
#include <memory> // unique_ptr
#include <cstdint>
#include <cstring>

#include "common.hpp"
#include "compat/string.hpp"
#include "compat/string_view.hpp"
#include "compat/vector.hpp"

namespace wit {
/// A string in linear memory, freed unconditionally using free
///
/// A normal C++ string makes no guarantees about where the characters
/// are stored and how this is freed.
class string {
  uint8_t *data_;
  size_t length;
  static uint8_t* empty_ptr() { return (uint8_t *)1; }

public:
  string() : data_(empty_ptr()), length(0) {}
  string(string const &b) : string(from_view(b.get_view())) {}
  string(string &&b) : data_(b.data_), length(b.length) { b.leak(); }
  string &operator=(string const &) = delete;
  string &operator=(string &&b) {
    release();
    data_ = b.data_;
    length = b.length;
    b.leak();
    return *this;
  }
  string(char const *d, size_t l) : data_((uint8_t *)d), length(l) {}
  char const *data() const { return (char const *)data_; }
  size_t size() const { return length; }
  bool empty() const { return !length; }
  ~string() {
    release();
  }
  // leak the memory
  void leak() {
    data_ = empty_ptr();
    length = 0;
  }
  void release() {
    if (data_ && length > 0) {
      std::free(const_cast<uint8_t *>(data_));
    }
    leak();
  }
  // typically called by post
  static void drop_raw(void *ptr) {
    if (ptr != empty_ptr()) {
      std::free(ptr);
    }
  }
  string_view_impl::string_view get_view() const {
    return string_view_impl::string_view((const char *)data_, length);
  }
  string_impl::string to_string() const {
    return string_impl::string((const char *)data_, length);
  }
  static string from_view(string_view_impl::string_view v) {
    auto const len = v.size();
    if (len > 0) {
      char* addr = (char*)std::malloc(len);
      std::memcpy(addr, v.data(), len);
      return string(addr, len);
    }
    else {
      return string{};
    }
  }
};

/// A vector in linear memory, freed unconditionally using free
///
/// You can't detach the data memory from a vector, nor create one
/// in a portable way from a buffer and length without copying.
template <class T> class vector {
  T *data_;
  size_t length;

  static T* empty_ptr() { return (T*)alignof(T); }

public:
  vector() : data_(empty_ptr()), length(0) {}
  vector(vector const &b) : vector(from_view(b.get_view())) {}
  vector(vector &&b) : data_(b.data_), length(b.length) { b.leak(); }
  template <class U> vector(span_impl::span<U> v) : vector(from_view(v)) {}
  vector &operator=(vector const &) = delete;
  vector &operator=(vector &&b) {
    release();
    data_ = b.data_;
    length = b.length;
    b.leak();
    return *this;
  }
  vector(T *d, size_t l) : data_(d), length(l) {}
  T const *data() const { return data_; }
  T *data() { return data_; }
  T &operator[](size_t n) { return data_[n]; }
  T const &operator[](size_t n) const { return data_[n]; }
  size_t size() const { return length; }
  bool empty() const { return !length; }
  ~vector() {
    release();
  }
  // WARNING: vector contains uninitialized elements
  static vector<T> allocate(size_t len) {
    if (len) {
      return vector{(T*)std::malloc(sizeof(T) * len), len};
    }
    else {
      return vector{};
    }
  }
  void initialize(size_t n, T&& elem) {
    new ((void *)(data_ + n)) T(std::move(elem));
  }
  // leak the memory
  T* leak() {
    T* temp = data_;
    data_ = empty_ptr();
    length = 0;
    return temp;
  }
  void release() {
    if (data_ && length > 0) {
      for (size_t i = 0; i < length; ++i) {
        data_[i].~T();
      }
      std::free(data_);
    }
    leak();
  }
  // typically called by post
  static void drop_raw(void *ptr) {
    if (ptr != empty_ptr()) {
      std::free(ptr);
    }
  }
  span_impl::span<T> get_view() const {
    return span_impl::span<T>(data_, length);
  }
  span_impl::span<const T> get_const_view() const {
    return span_impl::span<const T>(data_, length);
  }
  vector_impl::vector<T> to_vector() const {
    auto d = (const T *)(data_);
    return vector_impl::vector<T>(d, d + length);
  }
  template <class U>
  static vector from_view(span_impl::span<U> v) {
    if (v.empty()) {
      return vector<T>{};
    }
    else {
      auto result = vector<T>::allocate(v.size());
      for (size_t i = 0; i < v.size(); ++i) {
        new ((void *)(result.data_ + i)) T(v[i]);
      }
      return result;
    }
  }
};

/// @brief  A Resource defined within the guest (guest side)
///
/// It registers with the host and should remain in a static location.
/// Typically referenced by the Owned type
///
/// Note that deregistering will cause the host to call Dtor which
/// in turn frees the object.
template <class R> class ResourceExportBase {
public:
  struct Deregister {
    void operator()(R *ptr) const {
      // probably always true because of unique_ptr wrapping, TODO: check
#ifdef WIT_SYMMETRIC
      if (ptr->handle != nullptr)
#else
      if (ptr->handle >= 0)
#endif
      {
        // we can't deallocate because the host calls Dtor
        R::ResourceDrop(ptr->handle);
      }
    }
  };
  typedef std::unique_ptr<R, Deregister> Owned;

#ifdef WIT_SYMMETRIC
  typedef uint8_t *handle_t;
  static constexpr handle_t invalid = nullptr;
#else
  typedef int32_t handle_t;
  static const handle_t invalid = -1;
#endif

  handle_t handle;

  ResourceExportBase() : handle(R::ResourceNew((R *)this)) {}
  // because this function is called by the host via Dtor we must not deregister
  ~ResourceExportBase() {}
  ResourceExportBase(ResourceExportBase const &) = delete;
  ResourceExportBase(ResourceExportBase &&) = delete;
  ResourceExportBase &operator=(ResourceExportBase &&b) = delete;
  ResourceExportBase &operator=(ResourceExportBase const &) = delete;
  handle_t get_handle() const { return handle; }
  handle_t into_handle() {
    handle_t result = handle;
    handle = invalid;
    return result;
  }
};

/// @brief A Resource imported from the host (guest side)
///
/// Wraps the identifier and can be forwarded but not duplicated
class ResourceImportBase {
public:
#ifdef WIT_SYMMETRIC
  typedef uint8_t *handle_t;
  static constexpr handle_t invalid = nullptr;
#else
  typedef int32_t handle_t;
  static const handle_t invalid = -1;
#endif

protected:
  handle_t handle;

public:
  ResourceImportBase(handle_t h = invalid) : handle(h) {}
  ResourceImportBase(ResourceImportBase &&r) : handle(r.handle) {
    r.handle = invalid;
  }
  ResourceImportBase(ResourceImportBase const &) = delete;
  void set_handle(handle_t h) { handle = h; }
  handle_t get_handle() const { return handle; }
  handle_t into_handle() {
    handle_t h = handle;
    handle = invalid;
    return h;
  }
  ResourceImportBase &operator=(ResourceImportBase &&r) {
    assert(handle == invalid);
    handle = r.handle;
    r.handle = invalid;
    return *this;
  }
  ResourceImportBase &operator=(ResourceImportBase const &r) = delete;
};
} // namespace wit
