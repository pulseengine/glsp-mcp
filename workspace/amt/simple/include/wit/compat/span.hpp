#pragma once

#include <mwd/span.hpp>

namespace wit {
namespace span_impl = ::mwd;
using span_impl::span;
using span_impl::as_bytes;
using span_impl::as_writable_bytes;
using span_impl::dynamic_extent;
}
