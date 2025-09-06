#pragma once

#include <cassert>
#include <map>

#include <cstddef> // size_t
#include <cstdint>

#include "compat/optional.hpp"
#include "compat/span.hpp"

namespace wit {

// Dummy type for when constructibility is required and hence real void is not allowed.
struct empty_t {};
inline constexpr empty_t empty{};

/// @brief Helper class to map between IDs and resources
/// @tparam R Type of the Resource
template <class R> class ResourceTable {
  static std::map<int32_t, R> resources;

public:
  static R *lookup_resource(int32_t id) {
    auto result = resources.find(id);
    return result == resources.end() ? nullptr : &result->second;
  }
  static int32_t store_resource(R &&value) {
    auto last = resources.rbegin();
    int32_t id = 1 + (last == resources.rend() ? 0 : last->first);
    resources.insert(std::pair<int32_t, R>(id, std::move(value)));
    return id;
  }
  static optional_impl::optional<R> remove_resource(int32_t id) {
    auto iter = resources.find(id);
    optional_impl::optional<R> result;
    if (iter != resources.end()) {
      result = std::move(iter->second);
      resources.erase(iter);
    }
    return std::move(result);
  }
};

template <typename Dst, typename Src>
static inline constexpr Dst bitcast(const Src& src) noexcept  {
    static_assert(std::is_trivially_copyable<Src>::value, "Source type must be trivially copyable.");
    static_assert(std::is_trivially_copyable<Dst>::value, "Destination type must be trivially copyable.");

    union {
        Src src_val;
        Dst dst_val;
    } u = {};
    u.src_val = src;
    return u.dst_val;
}

} // namespace wit
