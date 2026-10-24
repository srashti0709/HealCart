
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, ShoppingCart, Package, LoaderCircle } from "lucide-react";
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
      <div className="lavender-commerce flex min-h-screen items-center justify-center gap-3">
        <LoaderCircle className="animate-spin" />
        Loading product...
      </div>
    );
  }

  if (error || !product) {
    return (
      <main className="lavender-commerce mx-auto max-w-5xl p-8">
        <p className="mb-4 text-red-600">{error || "Product not found."}</p>
        <button
          onClick={() => navigate("/user")}
          className="rounded-lg bg-slate-900 px-5 py-3 text-white"
        >
          Back to products
        </button>
      </main>
    );
  }

  return (
    <main className="lavender-commerce min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <button
          onClick={() => navigate(-1)}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <div className="grid gap-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2 md:p-10">
          <div className="flex min-h-72 items-center justify-center rounded-2xl bg-slate-100 p-6">
            <img
              src={
                product.image ||
                "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600"
              }
              alt={product.name}
              className="max-h-96 w-full object-contain"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          </div>

          <div className="flex flex-col items-start">
            <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-800">
              {product.category}
            </span>

            <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              {product.name}
            </h1>

            <p className="mt-4 text-3xl font-semibold text-violet-800">
              ₹{Number(product.price).toLocaleString("en-IN")}
            </p>

            <p className="mt-5 leading-7 text-slate-600">
              {product.description || "No description available."}
            </p>

            <div className="mt-6 flex items-center gap-2 text-sm text-slate-600">
              <Package size={18} />
              {product.stock > 0
                ? `${product.stock} units available`
                : "Out of stock"}
            </div>

            <div className="mt-7 flex items-center gap-4">
              <label htmlFor="quantity" className="font-medium">
                Quantity
              </label>

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
                      ? Math.min(Math.floor(value), product.stock || 1)
                      : 1
                  );
                }}
                disabled={product.stock < 1}
                className="w-20 rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>

            <button
              onClick={addToCart}
              disabled={product.stock < 1}
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <ShoppingCart size={19} />
              {product.stock > 0 ? "Add to Cart" : "Out of Stock"}
            </button>

            {message && (
              <p className="mt-4 text-sm font-medium text-teal-800">
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
