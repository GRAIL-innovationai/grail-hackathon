import Link from "next/link";
export default function Demo() {
  return (
    <main className="demo-main">
      <span className="eyebrow">LESS, BUT BETTER</span>
      <h1>
        A little good
        <br />
        in every day.
      </h1>
      <p>A tiny store for things that make work and life feel better.</p>
      <div className="demo-options">
        <Link href="/demo/signup">
          <b>01 / Make yourself at home</b>
          <h2>Create an account →</h2>
          <p>Join us and get your personal welcome dashboard.</p>
        </Link>
        <Link href="/demo/cart">
          <b>02 / Find your essentials</b>
          <h2>Browse products →</h2>
          <p>Build your cart and check out in a few clicks.</p>
        </Link>
        <Link href="/demo/feedback">
          <b>03 / Tell us what you think</b>
          <h2>Send feedback →</h2>
          <p>Help us make little goods a little better.</p>
        </Link>
      </div>
    </main>
  );
}
