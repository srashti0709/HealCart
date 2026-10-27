
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  ArrowRight,
  ShoppingCart,
  Package,
  LoaderCircle,
  ShieldCheck,
  Truck,
  Minus,
  Plus,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { API_ENDPOINTS } from "../config/api";
import { readCart, writeCart } from "../lib/cart";

const formatPrice = (price) =>
  `₹${Number(price || 0).toLocaleString("en-IN")}`;

const getCategoryName = (category) => {
  if (!category) return "Electronics";

  return String(category)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError("");
        setImageFailed(false);
        setMessage("");
        setQuantity(1);

        const response = await axios.get(
          `${API_ENDPOINTS.products}/${id}`
        );

        setProduct(response.data.product);
      } catch (err) {
        setError(
          err.response?.data?.message ||
          "Unable to load product details."
        );
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchProduct();
    }
  }, [id]);

  const addToCart = () => {
    if (!product) return;

    const existingCart = readCart();

    const existingItem = existingCart.find(
      (item) => item.productId === product._id
    );

    const currentQuantity = existingItem?.quantity || 0;

    if (quantity + currentQuantity > product.stock) {
      setMessage("Requested quantity exceeds available stock.");
      return;
    }

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      existingCart.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity,
        image: product.image || "",
      });
    }

    writeCart(existingCart);
    setMessage("Product added to cart successfully!");
  };

  if (loading) {
    return (
      <main className="hc-page flex min-h-screen items-center justify-center px-5">
        <div className="hc-card w-full max-w-sm rounded-3xl border border-white bg-white/90 p-8 text-center shadow-xl shadow-violet-200/50">
          <LoaderCircle
            size={38}
            className="mx-auto animate-spin text-violet-600"
          />
          <h1 className="mt-5 text-xl font-bold text-[#24183e]">
            Loading product...
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Please wait while we fetch the details.
          </p>
        </div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="hc-page flex min-h-screen items-center justify-center px-5 py-12">
        <div className="hc-card w-full max-w-md rounded-3xl border border-white bg-white/90 p-8 text-center shadow-xl shadow-violet-200/50">
          <AlertCircle
            size={40}
            className="mx-auto text-red-500"
          />
          <h1 className="mt-5 text-2xl font-bold text-[#24183e]">
            Unable to load product
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            {error || "Product not found."}
          </p>
          <button
            type="button"
            onClick={() => navigate("/user")}
            className="hc-button mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800"
          >
            <ArrowLeft size={18} />
            Back to products
          </button>
        </div>
      </main>
    );
  }

  const inStock = Number(product.stock) > 0;
  const isLowStock = inStock && Number(product.stock) <= 3;
  const totalPrice = Number(product.price) * quantity;

  return (
    <main className="hc-page min-h-screen px-4 py-6 text-[#24183e] sm:px-6 sm:py-8 lg:px-10">
      <style>{`
        .hc-page {
          background:
            radial-gradient(ellipse at top left, #ede5ff 0%, transparent 38%),
            radial-gradient(ellipse at top right, #fce7ff 0%, transparent 30%),
            #fcfaff;
        }

        .hc-card {
          animation: hc-appear 450ms ease-out both;
        }

        .hc-product-image {
          max-height: 340px;
          width: 100%;
          object-fit: contain;
          filter: drop-shadow(0 16px 18px rgba(91, 55, 160, .14));
          transition: transform 300ms ease, filter 300ms ease;
        }

        .hc-product-image:hover {
          transform: scale(1.04) translateY(-3px);
          filter: drop-shadow(0 20px 22px rgba(91, 55, 160, .2));
        }

        .hc-button {
          transition: transform 200ms ease, box-shadow 200ms ease, background 200ms ease;
        }

        .hc-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px rgba(109, 40, 217, .18);
        }

        .hc-button:active:not(:disabled) {
          transform: scale(.98);
        }

        .hc-feature {
          transition: transform 200ms ease, border-color 200ms ease;
        }

        .hc-feature:hover {
          transform: translateY(-3px);
          border-color: #c4b5fd;
        }

        @keyframes hc-appear {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hc-card {
            animation: none;
          }

          .hc-product-image,
          .hc-button,
          .hc-feature {
            transition: none;
          }
        }
      `}</style>

      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-100 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div>
            <p className="text-lg font-extrabold text-[#24183e]">
              HealCart
            </p>
            <p className="text-xs text-violet-600">
              Self-Healing Commerce
            </p>
          </div>
        </header>

        <section className="hc-card overflow-hidden rounded-3xl border border-white bg-white/85 shadow-xl shadow-violet-200/40 backdrop-blur-xl">
          <div className="grid lg:grid-cols-2">
            <div className="flex min-h-[300px] items-center justify-center bg-gradient-to-br from-violet-100 via-purple-50 to-fuchsia-50 p-6 sm:min-h-[420px] sm:p-10">
              {product.image && !imageFailed ? (
                <img
                  src={product.image}
                  alt={product.name}
                  onError={() => setImageFailed(true)}
                  className="hc-product-image"
                />
              ) : (
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-md">
                    <Package size={38} />
                  </div>
                  <p className="mt-4 max-w-xs break-words font-semibold text-slate-600">
                    {product.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Product image unavailable
                  </p>
                </div>
              )}
            </div>

            <div className="p-5 sm:p-8 lg:p-10">
              <span className="inline-flex rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700">
                {getCategoryName(product.category)}
              </span>

              <h1 className="mt-5 break-words text-3xl font-extrabold tracking-tight sm:text-4xl">
                {product.name}
              </h1>

              <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
                {product.description || "No description available."}
              </p>

              <div className="mt-6">
                <p className="text-sm font-medium text-slate-500">
                  Price per item
                </p>
                <p className="mt-1 text-4xl font-extrabold text-violet-700">
                  {formatPrice(product.price)}
                </p>
              </div>

              <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Package size={22} className="text-violet-700" />
                    <div>
                      <p className="text-sm font-bold">
                        Availability
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {inStock
                          ? `${product.stock} units available`
                          : "Currently out of stock"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${!inStock
                        ? "bg-red-100 text-red-700"
                        : isLowStock
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                  >
                    {!inStock
                      ? "Sold out"
                      : isLowStock
                        ? "Limited stock"
                        : "In stock"}
                  </span>
                </div>

                {isLowStock && (
                  <p className="mt-3 flex items-center gap-2 text-xs text-amber-800">
                    <AlertCircle size={15} />
                    Only {product.stock}{" "}
                    {Number(product.stock) === 1 ? "unit" : "units"} left.
                  </p>
                )}
              </div>

              <div className="mt-6">
                <label
                  htmlFor="quantity"
                  className="text-sm font-bold"
                >
                  Choose quantity
                </label>

                <div className="mt-3 flex items-center gap-4">
                  <div className="flex items-center rounded-xl border border-violet-200 bg-white p-1">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() =>
                        setQuantity((current) =>
                          Math.max(1, current - 1)
                        )
                      }
                      disabled={!inStock || quantity <= 1}
                      className="rounded-lg p-2.5 text-violet-700 transition hover:bg-violet-100 disabled:opacity-40"
                    >
                      <Minus size={17} />
                    </button>

                    <input
                      id="quantity"
                      type="number"
                      min="1"
                      max={product.stock}
                      value={quantity}
                      disabled={!inStock}
                      onChange={(event) => {
                        const value = Number(event.target.value);

                        setQuantity(
                          Number.isFinite(value) && value >= 1
                            ? Math.min(
                              Math.floor(value),
                              product.stock || 1
                            )
                            : 1
                        );

                        setMessage("");
                      }}
                      className="w-14 border-0 bg-transparent text-center font-bold outline-none"
                    />

                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() =>
                        setQuantity((current) =>
                          Math.min(product.stock || 1, current + 1)
                        )
                      }
                      disabled={!inStock || quantity >= product.stock}
                      className="rounded-lg p-2.5 text-violet-700 transition hover:bg-violet-100 disabled:opacity-40"
                    >
                      <Plus size={17} />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-xs text-slate-500">
                      Total price
                    </p>
                    <p className="text-xl font-extrabold text-[#24183e]">
                      {formatPrice(totalPrice)}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={addToCart}
                disabled={!inStock}
                className="hc-button mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-4 font-bold text-white shadow-lg shadow-violet-200 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none"
              >
                <ShoppingCart size={20} />
                {inStock ? "Add to cart" : "Out of stock"}
                {inStock && <ArrowRight size={18} />}
              </button>

              {message && (
                <div
                  key={message}
                  role="status"
                  aria-live="polite"
                  className={`mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm font-medium ${message.includes("successfully")
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-700"
                    }`}
                >
                  {message.includes("successfully") ? (
                    <CheckCircle2 size={20} className="shrink-0" />
                  ) : (
                    <AlertCircle size={20} className="shrink-0" />
                  )}

                  <div>
                    <p>{message}</p>

                    {message.includes("successfully") && (
                      <button
                        type="button"
                        onClick={() => navigate("/user/cart")}
                        className="mt-2 inline-flex items-center gap-1 font-bold underline underline-offset-4"
                      >
                        View cart
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-start gap-3 border-t border-violet-100 pt-5">
                <ShieldCheck
                  size={22}
                  className="mt-0.5 shrink-0 text-violet-600"
                />
                <p className="text-xs leading-6 text-slate-500">
                  HealCart checks available stock before adding products
                  and keeps your cart connected to the existing shopping
                  flow.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="hc-feature flex items-center gap-3 rounded-2xl border border-white bg-white/80 p-4 shadow-sm">
            <ShieldCheck className="shrink-0 text-violet-600" size={22} />
            <span className="text-sm font-semibold">Secure shopping</span>
          </div>

          <div className="hc-feature flex items-center gap-3 rounded-2xl border border-white bg-white/80 p-4 shadow-sm">
            <Truck className="shrink-0 text-violet-600" size={22} />
            <span className="text-sm font-semibold">Order updates</span>
          </div>

          <div className="hc-feature flex items-center gap-3 rounded-2xl border border-white bg-white/80 p-4 shadow-sm">
            <Package className="shrink-0 text-violet-600" size={22} />
            <span className="text-sm font-semibold">Stock visibility</span>
          </div>
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-violet-200/70 py-5">
          <div>
            <p className="font-bold text-[#24183e]">HealCart</p>
            <p className="mt-1 text-xs text-slate-500">
              Self-Healing Commerce
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/user/cart")}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            <ShoppingCart size={17} />
            View cart
          </button>
        </footer>
      </div>
    </main>
  );
}
