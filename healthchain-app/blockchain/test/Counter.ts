import { expect } from "chai";
import hre from "hardhat";

describe("Counter", function () {
  it("Should have empty record initially", async function () {
    const { ethers } = await hre.network.connect();
    const counter = await ethers.deployContract("Counter");

    expect(await counter.getRecord()).to.equal("");
  });

  it("Should set and get record correctly", async function () {
    const { ethers } = await hre.network.connect();
    const counter = await ethers.deployContract("Counter");

    await counter.setRecord("Hello, World!");
    expect(await counter.getRecord()).to.equal("Hello, World!");
  });

  it("Should update record when set multiple times", async function () {
    const { ethers } = await hre.network.connect();
    const counter = await ethers.deployContract("Counter");

    await counter.setRecord("First record");
    expect(await counter.getRecord()).to.equal("First record");

    await counter.setRecord("Second record");
    expect(await counter.getRecord()).to.equal("Second record");
  });

  it("Should handle empty string", async function () {
    const { ethers } = await hre.network.connect();
    const counter = await ethers.deployContract("Counter");

    await counter.setRecord("Some data");
    await counter.setRecord("");
    expect(await counter.getRecord()).to.equal("");
  });
});
