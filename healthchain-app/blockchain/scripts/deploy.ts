import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const registry = await ethers.deployContract("CredentialRegistry");

  await registry.waitForDeployment();

  console.log("CredentialRegistry deployed to:", await registry.getAddress());
}

main().catch((error) => {
  console.error(error);
  throw error;
});