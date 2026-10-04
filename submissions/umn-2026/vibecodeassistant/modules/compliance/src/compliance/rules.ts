import { COMPLIANCE_KEYWORDS } from "./keywords.js";
import { collectEvidence, collectSearchSpace, findMatches } from "./utils.js";
import type { ComplianceFinding, ComplianceRule, Severity } from "./types.js";

function buildFinding(args: {
  category: ComplianceFinding["category"];
  title: string;
  severity: Severity;
  passed: boolean;
  description: string;
  evidence: string[];
  recommendedFix: string;
}): ComplianceFinding {
  return {
    category: args.category,
    title: args.title,
    severity: args.severity,
    passed: args.passed,
    description: args.description,
    evidence: args.evidence,
    recommendedFix: args.recommendedFix
  };
}

export const privacyPolicyRule: ComplianceRule = {
  id: "privacy-policy",
  title: "Privacy Policy Check",
  evaluate(signal) {
    const searchSpace = collectSearchSpace(signal);
    const matches = findMatches(searchSpace, COMPLIANCE_KEYWORDS.privacy);

    return buildFinding({
      category: "privacy-policy",
      title: matches.length > 0 ? "Privacy Policy Found" : "Missing Privacy Policy",
      severity: matches.length > 0 ? "low" : "high",
      passed: matches.length > 0,
      description:
        matches.length > 0
          ? "The application appears to expose a privacy policy route, link, or file."
          : "No privacy policy page, link, or code artifact was detected in runtime or source signals.",
      evidence: collectEvidence(signal, COMPLIANCE_KEYWORDS.privacy),
      recommendedFix:
        "Add a privacy policy page and link it from the footer or primary navigation."
    });
  }
};

export const termsOfServiceRule: ComplianceRule = {
  id: "terms-of-service",
  title: "Terms of Service Check",
  evaluate(signal) {
    const searchSpace = collectSearchSpace(signal);
    const matches = findMatches(searchSpace, COMPLIANCE_KEYWORDS.terms);

    return buildFinding({
      category: "terms-of-service",
      title: matches.length > 0 ? "Terms of Service Found" : "Missing Terms of Service",
      severity: matches.length > 0 ? "low" : "high",
      passed: matches.length > 0,
      description:
        matches.length > 0
          ? "The application appears to expose terms of service or terms and conditions."
          : "No terms of service route, link, or code artifact was detected.",
      evidence: collectEvidence(signal, COMPLIANCE_KEYWORDS.terms),
      recommendedFix:
        "Add a terms page and make it discoverable from the footer or sign-up flow."
    });
  }
};

export const cookieConsentRule: ComplianceRule = {
  id: "cookie-consent",
  title: "Cookie Consent Check",
  evaluate(signal) {
    const searchSpace = collectSearchSpace(signal);
    const matches = findMatches(searchSpace, COMPLIANCE_KEYWORDS.cookies);

    return buildFinding({
      category: "cookie-consent",
      title: matches.length > 0 ? "Cookie Consent Signal Found" : "Missing Cookie Notice or Consent",
      severity: matches.length > 0 ? "low" : "medium",
      passed: matches.length > 0,
      description:
        matches.length > 0
          ? "The application appears to include a cookie notice, cookie policy, or cookie controls."
          : "No cookie consent UI, cookie policy text, or cookie management link was detected.",
      evidence: collectEvidence(signal, COMPLIANCE_KEYWORDS.cookies),
      recommendedFix:
        "Add a cookie banner or settings control and link to a cookie policy if tracking cookies are used."
    });
  }
};

export const contactPageRule: ComplianceRule = {
  id: "contact-page",
  title: "Contact Page Check",
  evaluate(signal) {
    const searchSpace = collectSearchSpace(signal);
    const matches = findMatches(searchSpace, COMPLIANCE_KEYWORDS.contact);

    return buildFinding({
      category: "contact-page",
      title: matches.length > 0 ? "Contact Page Found" : "Missing Contact Page",
      severity: matches.length > 0 ? "low" : "medium",
      passed: matches.length > 0,
      description:
        matches.length > 0
          ? "The application appears to provide a contact or support route."
          : "No contact or support page was detected in the runtime or codebase signals.",
      evidence: collectEvidence(signal, COMPLIANCE_KEYWORDS.contact),
      recommendedFix:
        "Add a contact or support page and link it from the main navigation or footer."
    });
  }
};

export const aboutPageRule: ComplianceRule = {
  id: "about-page",
  title: "About Page Check",
  evaluate(signal) {
    const searchSpace = collectSearchSpace(signal);
    const matches = findMatches(searchSpace, COMPLIANCE_KEYWORDS.about);

    return buildFinding({
      category: "about-page",
      title: matches.length > 0 ? "About Page Found" : "Missing About Page",
      severity: matches.length > 0 ? "low" : "low",
      passed: matches.length > 0,
      description:
        matches.length > 0
          ? "The application appears to provide an about/company page."
          : "No about/company page was detected. This may reduce transparency and trust for end users.",
      evidence: collectEvidence(signal, COMPLIANCE_KEYWORDS.about),
      recommendedFix:
        "Add an about/company page describing the product, organization, or team."
    });
  }
};

export const complianceRules: ComplianceRule[] = [
  privacyPolicyRule,
  termsOfServiceRule,
  cookieConsentRule,
  contactPageRule,
  aboutPageRule
];
