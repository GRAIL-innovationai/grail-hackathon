import "./globals.css";
export const metadata = {
  title: "GhostQA · Autonomous QA",
  description: "Autonomous users that find bugs before your users do.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
