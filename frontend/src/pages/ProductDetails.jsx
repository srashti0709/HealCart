import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  ShoppingCart,
  Package,
  LoaderCircle,
  ShieldCheck,
  Truck,
  RefreshCw,
  Minus,
  Plus,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { API_ENDPOINTS } from "../config/api";
import { readCart, writeCart } from "../lib/cart";

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await axios.get(
          `${API_ENDPOINTS.products}/${id}`
        );

        setProduct(response.data.product);
      } catch (err) {
        setError(
          err.response?.data?.message || "Unable to load product details."
        );
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchProduct();
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
      <main className="lavender-commerce flex min-h-screen items-center justify-center bg-[#fdf8ff] px-6 text-[#1d1737]">
        <div className="flex flex-col items-center gap-5 rounded-3xl border border-violet-100 bg-white px-10 py-12 text-center shadow-xl shadow-violet-100/60">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <LoaderCircle size={32} className="animate-spin" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Loading product details</h1>
            <p className="mt-2 text-base text-[#69647d]">
              Getting the latest product information.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="lavender-commerce min-h-screen bg-[#fdf8ff] px-5 py-16 text-[#1d1737] sm:px-8">
        <div className="mx-auto max-w-2xl rounded-3xl border border-violet-100 bg-white p-8 text-center shadow-lg shadow-violet-100/50 sm:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertCircle size={32} />
          </div>

          <h1 className="mt-6 text-2xl font-bold">
            Unable to load this product
          </h1>

          <p className="mt-3 text-base leading-7 text-[#69647d]">
            {error || "Product not found."}
          </p>

          <button
            onClick={() => navigate("/user")}
            className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#5441db] px-6 py-3 text-base font-semibold text-white transition hover:bg-[#3d23c5] focus:outline-none focus:ring-4 focus:ring-violet-200"
          >
            <ArrowLeft size={20} />
            Back to products
          </button>
        </div>
      </main>
    );
  }

  const inStock = Number(product.stock) > 0;
  const totalPrice = Number(product.price) * quantity;

  return (
    <main className="lavender-commerce min-h-screen bg-[#fdf8ff] px-4 py-8 text-[#1d1737] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex min-h-12 items-center gap-2 rounded-full border border-violet-100 bg-white px-5 py-3 text-base font-semibold text-[#474555] shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-[#5441db]"
          >
            <ArrowLeft size={20} />
            Back to products
          </button>

          <div className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white px-4 py-3 text-base font-medium text-[#474555]">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Product details
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-xl shadow-violet-100/50">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-violet-100/70 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-purple-100/60 blur-3xl" />

          <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-2 lg:gap-12 lg:p-12">
            <div className="flex min-w-0 flex-col gap-5">
              <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-3xl border border-violet-100 bg-gradient-to-br from-[#f7f1ff] via-[#fdfaff] to-[#ece4ff] p-8 sm:min-h-[480px] sm:p-12">
                <div className="absolute left-5 top-5 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 text-base font-semibold text-[#474555] shadow-sm backdrop-blur">
                    <ShieldCheck size={19} className="text-[#5441db]" />
                    Product details
                  </span>
                </div>

                {inStock && (
                  <span className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-base font-semibold text-emerald-800 ring-1 ring-emerald-100">
                    <CheckCircle2 size={18} />
                    In stock
                  </span>
                )}

                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="relative z-10 max-h-[400px] w-full object-contain drop-shadow-xl transition duration-500 hover:scale-105"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="tech-image-placeholder relative z-10 flex min-h-72 w-full flex-col items-center justify-center rounded-2xl border border-violet-100 bg-white/70 p-8 text-center">
                    <Package size={52} className="text-[#5441db]" />
                    <strong className="mt-5 text-xl font-bold text-[#1d1737]">
                      {product.name}
                    </strong>
                    <span className="mt-3 text-base text-[#69647d]">
                      Product image unavailable
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-[#f7f1ff] p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#5441db]">
                    <ShieldCheck size={23} />
                  </div>
                  <div>
                    <p className="text-base font-bold text-[#1d1737]">
                      Secure
                    </p>
                    <p className="mt-1 text-base text-[#69647d]">
                      Order processing
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-[#f7f1ff] p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#5441db]">
                    <Truck size={23} />
                  </div>
                  <div>
                    <p className="text-base font-bold text-[#1d1737]">
                      Delivery
                    </p>
                    <p className="mt-1 text-base text-[#69647d]">
                      Order updates
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-[#f7f1ff] p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#5441db]">
                    <RefreshCw size={22} />
                  </div>
                  <div>
                    <p className="text-base font-bold text-[#1d1737]">
                      SHCom
                    </p>
                    <p className="mt-1 text-base text-[#69647d]">
                      Resilient store
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col py-1 lg:py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full bg-[#e4dfff] px-4 py-2 text-base font-semibold text-[#3d23c5]">
                  {product.category || "Electronics"}
                </span>

                <span className="inline-flex items-center gap-2 text-base font-medium text-[#69647d]">
                  <Package size={19} />
                  Product information
                </span>
              </div>

              <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-[#1d1737] sm:text-4xl lg:text-5xl">
                {product.name}
              </h1>

              <p className="mt-5 text-base leading-8 text-[#69647d]">
                {product.description || "No description available."}
              </p>

              <div className="mt-8 rounded-2xl border border-violet-100 bg-gradient-to-r from-[#f7f1ff] to-[#fdfaff] p-5 sm:p-6">
                <p className="text-base font-semibold text-[#69647d]">
                  Price
                </p>

                <div className="mt-2 flex flex-wrap items-baseline gap-3">
                  <span className="text-3xl font-extrabold tracking-tight text-[#4f30e6] sm:text-4xl">
                    ₹{Number(product.price).toLocaleString("en-IN")}
                  </span>

                  <span className="text-base text-[#69647d]">
                    INR
                  </span>
                </div>

                {quantity > 1 && (
                  <div className="mt-4 flex items-center justify-between border-t border-violet-100 pt-4">
                    <span className="text-base text-[#69647d]">
                      {quantity} items
                    </span>
                    <span className="text-xl font-bold text-[#1d1737]">
                      ₹{totalPrice.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-7 rounded-2xl border border-violet-100 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-[#5441db]">
                      <Package size={23} />
                    </div>

                    <div>
                      <p className="text-base font-bold text-[#1d1737]">
                        Inventory availability
                      </p>
                      <p className="mt-1 text-base text-[#69647d]">
                        {inStock
                          ? `${product.stock} units available`
                          : "Currently out of stock"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-4 py-2 text-base font-semibold ${
                      inStock
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {inStock ? "Available" : "Sold out"}
                  </span>
                </div>

                
              </div>

              <div className="mt-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <label
                    htmlFor="quantity"
                    className="text-base font-bold text-[#1d1737]"
                  >
                    Select quantity
                  </label>

                  <div className="inline-flex items-center rounded-xl border border-violet-100 bg-[#f7f1ff] p-1.5">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() =>
                        setQuantity((current) => Math.max(1, current - 1))
                      }
                      disabled={!inStock || quantity <= 1}
                      className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-[#5441db] transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus size={20} />
                    </button>

                    <input
                      id="quantity"
                      type="number"
                      min="1"
                      max={product.stock}
                      value={quantity}
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
                      disabled={!inStock}
                      className="w-16 border-0 bg-transparent text-center text-lg font-bold text-[#1d1737] outline-none disabled:opacity-50"
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
                      className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-[#5441db] transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-base text-[#69647d]">
                  {inStock
                    ? `Choose between 1 and ${product.stock} available units.`
                    : "This item cannot be added to your cart right now."}
                </p>
              </div>

              <button
                onClick={addToCart}
                disabled={!inStock}
                className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#5441db] to-[#6851ff] px-6 py-4 text-lg font-bold text-white shadow-lg shadow-violet-200 transition duration-200 hover:-translate-y-0.5 hover:from-[#3d23c5] hover:to-[#5441db] hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none"
              >
                <ShoppingCart size={22} />
                {inStock ? "Add to Cart" : "Out of Stock"}
                {inStock && (
                  <span className="ml-1">
                    · ₹{totalPrice.toLocaleString("en-IN")}
                  </span>
                )}
              </button>

              {message && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`mt-5 flex items-start gap-3 rounded-xl border p-4 text-base font-medium ${
                    message.includes("successfully")
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {message.includes("successfully") ? (
                    <CheckCircle2 className="mt-0.5 shrink-0" size={22} />
                  ) : (
                    <AlertCircle className="mt-0.5 shrink-0" size={22} />
                  )}
                  <div className="flex-1">{message}</div>

                  {message.includes("successfully") && (
                    <button
                      onClick={() => navigate("/user/cart")}
                      className="shrink-0 font-bold underline underline-offset-4"
                    >
                      View cart
                    </button>
                  )}
                </div>
              )}

              <div className="mt-6 flex items-start gap-3 rounded-xl bg-[#f7f1ff] p-4 text-base leading-7 text-[#474555]">
                <ShieldCheck
                  size={22}
                  className="mt-0.5 shrink-0 text-[#5441db]"
                />
                <p>
                  SHCom checks available stock before adding items and keeps
                  your cart synchronized with the store.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}