#include <iostream>

#include "../gen/src/component_b.cpp"
using namespace std;

namespace exports {
namespace component_b {
namespace component_b_main {
namespace goodies = ::component_b::component_b_goodies;
bool Run() {
    goodies::Rec r{0xCAFEBABE, -128};
    goodies::Print(r);
    return true;
}
wit::vector<uint8_t> PrintVec(wit::vector<uint8_t> vec) {
    auto a = vec.to_vector();
    std::cout << "b: ";
    for (int i = 0; i < a.size(); i++) {
        std::cout << static_cast<int>(a[i]) << " ";
    }
    std::cout << std::endl;
    return vec;
}
}  // namespace component_b_main
}  // namespace component_b
}  // namespace exports
