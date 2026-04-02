import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readEnvValue(filePath: string, key: string): string {
  if (!fs.existsSync(filePath)) return "";
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return String(match?.[1] || "").trim();
}

function normalizeAddress(value: string): string {
  return String(value || "").trim().toLowerCase();
}

async function assertCompatibleContract(address: string) {
  const { ethers } = await network.connect();
  const provider = ethers.provider;

  const [networkInfo, code] = await Promise.all([
    provider.getNetwork(),
    provider.getCode(address),
  ]);

  if (!code || code === "0x") {
    console.warn(
      `[preflight] No bytecode found at ${address} on chainId ${String(networkInfo.chainId)}. ` +
      `If this is before deploy, this is expected after a chain reset.`
    );
    return;
  }

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
        `Contract at ${address} is not a compatible CredentialRegistry for current ABI.`
      );
    }
    throw error;
  }
}

async function main() {
  const frontendEnvPath = path.join(__dirname, "../../.env");
  const backendEnvPath = path.join(__dirname, "../../../healthchain-backend/.env");

  const frontendAddressRaw = readEnvValue(
    frontendEnvPath,
    "VITE_CREDENTIAL_REGISTRY_ADDRESS"
  );
  const backendAddressRaw = readEnvValue(
    backendEnvPath,
    "CREDENTIAL_REGISTRY_ADDRESS"
  );

  const frontendAddress = normalizeAddress(frontendAddressRaw);
  const backendAddress = normalizeAddress(backendAddressRaw);

  if (!frontendAddress && !backendAddress) {
    console.log("[preflight] No contract address configured in frontend/backend env yet.");
    console.log("[preflight] Skipping selector compatibility probe.");
    return;
  }

  if (frontendAddress && backendAddress && frontendAddress !== backendAddress) {
    throw new Error(
      `Env mismatch: frontend has ${frontendAddressRaw}, backend has ${backendAddressRaw}.`
    );
  }

  const targetAddress = frontendAddress || backendAddress;
  console.log(`[preflight] Probing CredentialRegistry at ${targetAddress} ...`);
  await assertCompatibleContract(targetAddress);
  console.log("[preflight] CredentialRegistry compatibility probe passed.");
}

main().catch((error) => {
  console.error("[preflight] Failed:", error?.message || error);
  process.exit(1);
});
