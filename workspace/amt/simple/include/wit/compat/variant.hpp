#pragma once

#include <variant>

namespace wit {
namespace variant_impl = ::std;
using variant_impl::variant;
using variant_impl::in_place_index_t;
using variant_impl::in_place_index;
using variant_impl::in_place_type_t;
using variant_impl::in_place_type;
using variant_impl::monostate;
using variant_impl::variant_size;
using variant_impl::variant_size_v;
using variant_impl::variant_alternative;
using variant_impl::variant_alternative_t;
using variant_impl::visit;
using variant_impl::holds_alternative;
using variant_impl::get;
using variant_impl::get_if;
}
