#include <algorithm>
#include <cstdint>
#include <iostream>

#include "../gen/src/runtime_cpp.h"

namespace exports {
namespace runtime {
namespace runtime_goodies {

void Print(Rec r) {
    const auto a = std::uintmax_t{r.a};
    const auto b = static_cast<std::uintmax_t>(std::intmax_t{r.b}) & 0xFFu;
    std::cerr << std::uppercase << std::hex << "a: 0x" << a << ", b: 0x" << b << std::endl;
}

Rec Passthru(Rec r) { return r; }
}  // namespace runtime_goodies
}  // namespace runtime
}  // namespace exports

int main() {
    runtime::runtime_main_a::Run();
    runtime::runtime_main_b::Run();

    std::vector<uint8_t> vec = {1, 2, 3, 4, 5};
    runtime::runtime_main_a::PrintVec(vec);
    auto res = runtime::runtime_main_b::PrintVec(vec).to_vector();
    assert(std::equal(vec.begin(), vec.end(), res.begin()));

    std::vector<uint8_t> e_vec = {};
    runtime::runtime_main_a::PrintVec(e_vec);
    auto res_e = runtime::runtime_main_b::PrintVec(e_vec).to_vector();
    assert(std::equal(e_vec.begin(), e_vec.end(), res_e.begin()));
    return 0;
}