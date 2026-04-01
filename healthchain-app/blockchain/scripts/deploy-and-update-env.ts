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

  console.log("\n✨ Deployment complete!");
  console.log("📌 Contract Address:", address);
  console.log("✅ Both .env files updated automatically!\n");
}

function updateEnvFile(filePath: string, key: string, value: string) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  File not found: ${filePath}`);
    return;
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

main().catch((error) => {
  console.error("❌ Error:", error);
  throw error;
});
