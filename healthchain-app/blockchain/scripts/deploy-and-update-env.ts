import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const { ethers } = await network.connect();

  console.log("🚀 Deploying CredentialRegistry...");
  const registry = await ethers.deployContract("CredentialRegistry");
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log("✅ CredentialRegistry deployed to:", address);

  // Update frontend .env
  const frontendEnvPath = path.join(__dirname, "../../.env");
  console.log("📝 Updating frontend .env:", frontendEnvPath);
  updateEnvFile(frontendEnvPath, "VITE_CREDENTIAL_REGISTRY_ADDRESS", address);

  // Update backend .env
  const backendEnvPath = path.join(__dirname, "../../../healthchain-backend/.env");
  console.log("📝 Updating backend .env:", backendEnvPath);
  updateEnvFile(backendEnvPath, "CREDENTIAL_REGISTRY_ADDRESS", address);

  assertEnvValue(frontendEnvPath, "VITE_CREDENTIAL_REGISTRY_ADDRESS", address);
  assertEnvValue(backendEnvPath, "CREDENTIAL_REGISTRY_ADDRESS", address);

  // Fail fast if deployed address is not compatible with expected selector set.
  await assertCompatibleContract(address);

  console.log("\n✨ Deployment complete!");
  console.log("📌 Contract Address:", address);
  console.log("✅ Both .env files updated automatically!\n");
}

function updateEnvFile(filePath: string, key: string, value: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  let content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(`^${key}=.*$`, "m");

  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
    console.log(`  ✓ Updated ${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
    console.log(`  ✓ Added ${key}=${value}`);
  }

  fs.writeFileSync(filePath, content, "utf-8");
}

function assertEnvValue(filePath: string, key: string, expected: string) {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  const actual = String(match?.[1] || "").trim().toLowerCase();
  const normalizedExpected = String(expected).trim().toLowerCase();
  if (actual !== normalizedExpected) {
    throw new Error(
      `Failed to verify ${key} in ${filePath}. Expected ${normalizedExpected}, got ${actual || "<empty>"}.`
    );
  }
}

async function assertCompatibleContract(address: string) {
  const { ethers } = await network.connect();
  const provider = ethers.provider;
  const probeContract = new ethers.Contract(
    address,
    ["function getPatientRecordCount(address patient) view returns (uint256)"],
    provider
  );

  try {
    await probeContract.getPatientRecordCount(ethers.ZeroAddress);
  } catch (error: any) {
    const message = String(error?.shortMessage || error?.message || "").toLowerCase();
    if (
      message.includes("unrecognized selector") ||
      message.includes("missing revert data") ||
      message.includes("call exception")
    ) {
      throw new Error(
        `Post-deploy probe failed: contract at ${address} is not compatible with CredentialRegistry ABI.`
      );
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("❌ Error:", error);
  throw error;
});
