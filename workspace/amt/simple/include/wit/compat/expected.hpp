#pragma once

#include <ztd/expected.hpp>

namespace wit {
namespace expected_impl {
  using namespace ::ztd;
  using std::in_place_t;
  using std::in_place;
};

using expected_impl::expected;
using in_place_expected_t = expected_impl::in_place_t;
constexpr auto in_place_expected = expected_impl::in_place;
using expected_impl::unexpected;
using expected_impl::bad_expected_access;
using expected_impl::unexpect_t;
using expected_impl::unexpect;
}
