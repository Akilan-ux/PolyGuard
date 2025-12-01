// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PolyGuardRegistry {
    address public owner;
    mapping(bytes32 => address) public registry; // hash -> registrant
    event Registered(bytes32 indexed dataHash, address indexed registrant, uint256 timestamp);

    constructor() {
        owner = msg.sender;
    }

    function register(bytes32 dataHash) external returns (bool) {
        require(dataHash != bytes32(0), "Invalid hash");
        registry[dataHash] = msg.sender;
        emit Registered(dataHash, msg.sender, block.timestamp);
        return true;
    }

    function verify(bytes32 dataHash) external view returns (bool, address) {
        address registrant = registry[dataHash];
        if (registrant == address(0)) return (false, address(0));
        return (true, registrant);
    }
}
