#pragma once

#include <mwd/optional.hpp>

namespace wit {
namespace optional_impl = ::mwd;
using optional_impl::optional;
using in_place_optional_t = ztd::in_place_t;
constexpr auto in_place_opt = ztd::in_place;
using optional_impl::nullopt_t;
using optional_impl::nullopt;
using optional_impl::bad_optional_access;
}
