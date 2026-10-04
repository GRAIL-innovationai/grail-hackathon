"use client";
import { useState } from "react";
const products = [
  { id: "notebook", name: "Everyday Notebook", price: 18, icon: "▤" },
  { id: "cup", name: "Studio Cup", price: 24, icon: "◡" },
];
export default function Cart() {
  const [items, setItems] = useState<typeof products>([]),
    [total, setTotal] = useState(0),
    [done, setDone] = useState(false);
  return (
    <main className="demo-main">
      <span className="eyebrow">THE EVERYDAY COLLECTION</span>
      <h1>Good things. Small joys.</h1>
      <div className="shop-layout">
        <section className="products">
          {products.map((p) => (
            <article key={p.id}>
              <div className="product-art">{p.icon}</div>
              <h2>{p.name}</h2>
              <p>${p.price.toFixed(2)}</p>
              <button
                disabled={items.some((i) => i.id === p.id)}
                onClick={() => {
                  setItems([...items, p]);
                  setTotal(total + p.price);
                  setDone(false);
                }}
              >
                Add {p.name}
              </button>
            </article>
          ))}
        </section>
        <section className="cart-panel">
          <h2>Your cart</h2>
          {items.length === 0 ? (
            <p>Your cart is empty.</p>
          ) : (
            items.map((p) => (
              <div className="cart-item" key={p.id}>
                <b>{p.name}</b>
                <p>Item price: ${p.price.toFixed(2)}</p>
                <button
                  onClick={() => {
                    /* INTENTIONAL BUG B: list changes without recomputing the total. */ setItems(
                      items.filter((i) => i.id !== p.id),
                    );
                  }}
                >
                  Remove {p.name}
                </button>
              </div>
            ))
          )}
          <h2>Total: ${total.toFixed(2)}</h2>
          <button disabled={!items.length} onClick={() => setDone(true)}>
            Complete checkout
          </button>
          {done && (
            <div className="success">
              Order confirmed. Thank you for shopping!
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
