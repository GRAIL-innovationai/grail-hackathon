# Compliance Module

Integrated from `Giovanni-Compliance` into `modules/compliance` so the Next.js app keeps its root configuration. From the repository root, run `npm run compliance:demo` using the already installed TypeScript dependency. The source module is preserved; checked-in `node_modules` and generated `dist` files are excluded.

A lightweight TypeScript module for running basic website compliance and trust checks against collected runtime and source-code signals.

## What it does

The module evaluates a set of simple compliance checks for:

- Privacy policy presence
- Terms of service presence
- Cookie consent or cookie notice signals
- Contact page presence
- About/company page presence

It accepts a `ComplianceSignal` object containing discovered URLs, link text, page text snippets, file paths, and optional file contents, then returns structured findings with severity, evidence, and recommended fixes.

## Project structure

- `src/compliance/types.ts` - shared types for signals, findings, rules, and results
- `src/compliance/checker.ts` - main `runComplianceChecks` entry point
- `src/compliance/rules.ts` - rule definitions and evaluation logic
- `src/compliance/keywords.ts` - keyword lists used for matching
- `src/compliance/utils.ts` - normalization, matching, and evidence helpers
- `src/example.ts` - runnable example

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Run the example

```bash
npm start
```

## Example usage

```ts
import { runComplianceChecks, type ComplianceSignal } from "./compliance/index.js";

const signal: ComplianceSignal = {
  discoveredUrls: ["/", "/pricing", "/privacy-policy", "/contact"],
  discoveredLinkTexts: ["Home", "Pricing", "Privacy Policy", "Contact Us"],
  pageTextSnippets: ["Accept cookies", "Learn more about our company"],
  filePaths: ["src/app/page.tsx", "src/app/privacy-policy/page.tsx"],
  fileContents: {
    "src/components/Footer.tsx": "<footer><a href='/privacy-policy'>Privacy Policy</a></footer>"
  }
};

const result = runComplianceChecks(signal);
console.log(result.summary);
```

## Current behavior

The included example currently reports 5 total checks, with 4 passing and 1 failing because no terms of service signal is present.

## Notes

This module uses keyword- and path-based heuristics, so it is intended as a lightweight screening layer rather than a substitute for legal review.
