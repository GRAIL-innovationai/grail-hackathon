import { runMockScan } from "./orchestrator/runMockScan.js";
import { createScanRequest } from "./schemas/scan.js";

async function main() {
  const request = createScanRequest();

  const result = await runMockScan(request);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Mock scan failed:", error);
  process.exitCode = 1;
});
