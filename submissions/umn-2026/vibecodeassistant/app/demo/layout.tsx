import Link from "next/link";
export const metadata = { title: "little goods · Everyday essentials" };
export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="demo-shell">
      <nav>
        <Link href="/demo" className="demo-brand">
          ◈ little goods
        </Link>
        <div>
          <Link href="/demo/signup">Sign up</Link>
          <Link href="/demo/cart">Shop & cart</Link>
          <Link href="/demo/feedback">Feedback</Link>
        </div>
      </nav>
      {children}
      <footer>Little goods · Thoughtful essentials for your everyday.</footer>
    </div>
  );
}
