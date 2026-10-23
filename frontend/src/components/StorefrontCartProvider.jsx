import { useEffect } from "react";
import { readCart, writeCart } from "../lib/cart";

/**
 * Listens for add-to-cart events published by Storefront product cards and
 * merges them into the localStorage-backed cart state. This keeps the cart
 * in sync with the product cards while leaving all cart state management in
 * StorefrontLayout via the useLocalStorage hook.
 */
export default function StorefrontCartProvider({ children }) {
  useEffect(() => {
    const handler = (event) => {
      const detail = event.detail;
      if (!detail?.productId) return;

      const cart = readCart();

      const existing = cart.find((item) => item.productId === detail.productId);

      if (existing) {
        existing.quantity += 1;
      } else {
        cart.push({
          productId: detail.productId,
          name: detail.name,
          price: detail.price,
          quantity: 1,
          image: detail.image || "",
        });
      }

      writeCart(cart);
    };

    window.addEventListener("shcom-cart-add", handler);
    return () => window.removeEventListener("shcom-cart-add", handler);
  }, []);

  return children;
}
