// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Counter {
    string public record;

    function setRecord(string memory _record) public {
        record = _record;
    }

    function getRecord() public view returns (string memory) {
        return record;
    }
}