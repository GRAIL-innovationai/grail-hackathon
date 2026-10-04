import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
export const localHost = (host: string) =>
  ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host.toLowerCase());
function privateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const ip = address.toLowerCase();
  if (ip.startsWith("::ffff:"))
    return privateAddress(ip.slice(7)) || !ip.slice(7).includes(".");
  return ip === "::" || ip === "::1" || /^(fc|fd|fe[89ab]|ff)/.test(ip);
}
export async function validateTarget(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw new Error("Use an HTTP(S) URL without embedded credentials.");
  if (localHost(u.hostname)) return u;
  const addresses = await lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => privateAddress(a.address)))
    throw new Error(
      "Private networks and metadata endpoints are outside the supported target scope. Use localhost or a public website.",
    );
  return u;
}
export const riskyAction =
  /(?:\b(delete|destroy|purchase|pay|checkout|transfer|unsubscribe|logout|sign.?out|deactivate|reset.password|accept.*terms|agree.*terms)\b)/i;
