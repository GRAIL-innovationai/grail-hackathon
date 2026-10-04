"use client";
import { useState } from "react";
export default function Feedback() {
  const [done, setDone] = useState(false);
  return (
    <main className="demo-main narrow">
      <span className="eyebrow">WE ARE LISTENING</span>
      <h1>Have a thought?</h1>
      {done ? (
        <div className="success">
          <h2>Feedback received</h2>
          <p>Thank you for helping us improve.</p>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            /* INTENTIONAL BUG C: required field bypassed by noValidate and no submission check. */ setDone(
              true,
            );
          }}
        >
          <label htmlFor="message">Message</label>
          <textarea id="message" required placeholder="What could be better?" />
          <p>Message is required.</p>
          <button>Send feedback</button>
        </form>
      )}
    </main>
  );
}
