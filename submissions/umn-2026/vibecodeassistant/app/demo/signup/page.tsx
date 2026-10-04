"use client";
import { useState } from "react";
export default function Signup() {
  const [done, setDone] = useState(false);
  return (
    <main className="demo-main narrow">
      <span className="eyebrow">YOUR OWN LITTLE SPACE</span>
      <h1>{done ? "Welcome aboard." : "Create an account"}</h1>
      {done ? (
        <div className="success">
          <h2>Account created</h2>
          <p>You have reached your welcome dashboard. Make yourself at home.</p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            /* INTENTIONAL BUG A: minimum length is advertised but never validated. */ setDone(
              true,
            );
          }}
        >
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            placeholder="you@example.com"
          />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required />
          <p>Password must contain at least 8 characters.</p>
          <button>Create account</button>
        </form>
      )}
    </main>
  );
}
