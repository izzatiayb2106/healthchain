// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Counter} from "./Counter.sol";
import {Test} from "forge-std/Test.sol";

// Solidity tests are compatible with foundry, so they
// use the same syntax and offer the same functionality.

contract CounterTest is Test {
  Counter counter;

  function setUp() public {
    counter = new Counter();
  }

  function test_InitialRecordIsEmpty() public view {
    require(
      keccak256(bytes(counter.getRecord())) == keccak256(bytes("")),
      "Initial record should be empty"
    );
  }

  function test_SetAndGetRecord() public {
    counter.setRecord("Hello, World!");
    require(
      keccak256(bytes(counter.getRecord())) == keccak256(bytes("Hello, World!")),
      "Record should match set value"
    );
  }

  function test_UpdateRecord() public {
    counter.setRecord("First");
    counter.setRecord("Second");
    require(
      keccak256(bytes(counter.getRecord())) == keccak256(bytes("Second")),
      "Record should be updated to Second"
    );
  }

  function testFuzz_SetRecord(string memory _record) public {
    counter.setRecord(_record);
    require(
      keccak256(bytes(counter.getRecord())) == keccak256(bytes(_record)),
      "Record should match fuzzed input"
    );
  }
}
