import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const Counter = await ethers.deployContract("Counter");

  await Counter.waitForDeployment();

  console.log("Counter deployed to:", await Counter.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});