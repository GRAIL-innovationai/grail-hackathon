import { runComplianceChecks, type ComplianceSignal } from "./compliance/index.js";

const sampleSignal: ComplianceSignal = {
  discoveredUrls: ["/", "/pricing", "/privacy-policy", "/contact"],
  discoveredLinkTexts: ["Home", "Pricing", "Privacy Policy", "Contact Us"],
  pageTextSnippets: ["Accept cookies", "Learn more about our company"],
  filePaths: [
    "src/app/page.tsx",
    "src/app/privacy-policy/page.tsx",
    "src/components/Footer.tsx"
  ],
  fileContents: {
    "src/components/Footer.tsx": "<footer><a href='/privacy-policy'>Privacy Policy</a></footer>"
  }
};

const result = runComplianceChecks(sampleSignal);

console.log(JSON.stringify(result, null, 2));
