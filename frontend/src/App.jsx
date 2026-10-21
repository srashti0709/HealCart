import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import ProductDetails from "./pages/ProductDetails";
import { useEffect, useState } from "react";
import Cart from "./pages/Cart";
import OrderHistory from "./pages/OrderHistory";
import Checkout from "./pages/Checkout";
import axios from "axios";
import {
  ShoppingBag,
  ShieldCheck,
  RefreshCw,
  Activity,
  Package,
  AlertCircle,
} from "lucide-react";

import { API_ENDPOINTS } from "./config/api";

function Storefront() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restocks, setRestocks] = useState([]);

  const [backendStatus, setBackendStatus] = useState("Checking");
  const [lastChecked, setLastChecked] = useState(null);

  const [recoveryInfo, setRecoveryInfo] = useState(null);
  const [recoveryError, setRecoveryError] = useState("");

  const fetchRecoveryInfo = async () => {
    try {
      const response = await axios.get(
        "http://localhost:5002/api/recovery",
        { timeout: 3000 }
      );

      setRecoveryInfo(response.data);
      setRecoveryError("");
    } catch {
      setRecoveryError(
        "Recovery monitor unavailable. Make sure it is running."
      );
    }
  };


  const checkBackendHealth = async () => {
    try {
      const response = await axios.get(
        "http://localhost:5000/api/health",
        { timeout: 3000 }
      );

      setBackendStatus(
        response.data.status === "healthy" ? "Healthy" : "Unhealthy"
      );
    } catch {
      setBackendStatus("Unavailable");
    } finally {
      setLastChecked(new Date().toLocaleTimeString());
    }
  };

  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("shcomCart") || "[]");
    } catch {
      return [];
    }
  });
  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await axios.get(API_ENDPOINTS.products);
      setProducts(response.data.products || []);
    } catch {
      setError("Unable to connect to the SHCom backend.");
    } finally {
      setLoading(false);
    }
  };

  const fetchRestocks = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.restocks);
      setRestocks(response.data.restocks || []);
    } catch (error) {
      console.error("Unable to fetch restock requests:", error.message);
    }
  };

  const [restockActionId, setRestockActionId] = useState("");
  const [restockMessage, setRestockMessage] = useState("");
  const [restockError, setRestockError] = useState("");

  const refreshInventoryData = async () => {
    await Promise.all([fetchProducts(), fetchRestocks()]);
  };

  const confirmRestockDelivery = async (restockId) => {
    try {
      setRestockActionId(restockId);
      setRestockMessage("");
      setRestockError("");

      const response = await axios.post(
        `${API_ENDPOINTS.restocks}/${restockId}/confirm-delivery`
      );

      setRestockMessage(response.data.message || "Delivery confirmed.");
      await refreshInventoryData();
    } catch (error) {
      setRestockError(
        error.response?.data?.message || "Unable to confirm delivery."
      );
    } finally {
      setRestockActionId("");
    }
  };

  const cancelRestock = async (restockId) => {
    try {
      setRestockActionId(restockId);
      setRestockMessage("");
      setRestockError("");

      const response = await axios.post(
        `${API_ENDPOINTS.restocks}/${restockId}/cancel`
      );

      setRestockMessage(response.data.message || "Request cancelled.");
      await refreshInventoryData();
    } catch (error) {
      setRestockError(
        error.response?.data?.message || "Unable to cancel the request."
      );
    } finally {
      setRestockActionId("");
    }
  };


  useEffect(() => {
    fetchProducts();
    fetchRestocks();
  }, []);
  useEffect(() => {
    localStorage.setItem("shcomCart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    checkBackendHealth();

    const intervalId = setInterval(checkBackendHealth, 3000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    fetchRecoveryInfo();

    const intervalId = setInterval(fetchRecoveryInfo, 3000);

    return () => clearInterval(intervalId);
  }, []);
  




  const addToCart = (product) => {
    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => item.productId === product._id
      );

      const currentQuantity = existing?.quantity || 0;

      if (currentQuantity + 1 > product.stock) {
        alert(
          `Only ${product.stock} items are available in stock.`
        );
        return currentCart;
      }

      if (existing) {
        return currentCart.map((item) =>
          item.productId === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...currentCart,
        {
          productId: product._id,
          name: product.name,
          price: product.price,
          quantity: 1,
          image: product.image || "",
        },
      ];
    });
  };


  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-700 p-2 text-white">
              <ShieldCheck size={25} />
            </div>

            <div>
              <h1 className="text-xl font-bold text-slate-900">SHCom</h1>
              <p className="text-xs text-slate-500">
                Self-Healing Commerce
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <Link
              to="/dashboard"
              className="rounded-xl px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
            >
              Dashboard
            </Link>
            <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm text-emerald-700 sm:flex">
              <Activity size={16} />
              <span>Store Online</span>
            </div>

            <Link
              to="/cart"
              aria-label={`Open shopping cart with ${cartCount} items`}
              className="relative rounded-xl p-2 transition hover:bg-emerald-50"
            >
              <ShoppingBag size={24} />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-700 px-1 text-xs text-white">
                {cartCount}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-7 py-12 text-white sm:px-12 sm:py-16">
          <div className="relative z-[1] max-w-2xl">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-emerald-100">
              <ShieldCheck size={16} />
              Commerce that recovers itself
            </span>

            <h2 className="text-4xl font-bold leading-tight sm:text-5xl">
              Shop confidently.
              <br />
              We handle the failures.
            </h2>

            <p className="mt-5 max-w-xl leading-7 text-emerald-100">
              A simple shopping experience powered by intelligent
              monitoring, reliable transactions, and automated recovery.
            </p>

            <a
              href="#products"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-emerald-950 transition hover:bg-emerald-50"
            >
              Explore products
              <ShoppingBag size={18} />
            </a>
          </div>

          <div className="absolute -right-12 -top-16 h-72 w-72 rounded-full border border-emerald-400/20" />
          <div className="absolute -bottom-36 right-20 h-80 w-80 rounded-full border border-emerald-400/20" />
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">

          <StatusCard
            icon={<Activity size={20} />}
            title="Backend API"
            description={
              lastChecked
                ? `Last checked: ${lastChecked}`
                : "Checking backend connection..."
            }
            status={backendStatus}
          />


          <StatusCard
            icon={<Package size={20} />}
            title="Inventory"
            description="Stock-aware shopping"
            status="Enabled"
          />


          <StatusCard
            icon={<RefreshCw size={20} />}
            title="Backend Crash Recovery"
            description={
              recoveryInfo?.available
                ? `Docker restart count: ${recoveryInfo.restartCount}`
                : "Waiting for recovery monitor"
            }
            status={
              recoveryError
                ? "Monitor Offline"
                : recoveryInfo?.available
                  ? recoveryInfo.health === "healthy"
                    ? "Healthy"
                    : recoveryInfo.status
                  : "Checking"
            }
          />

        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
                Resilience monitoring
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                Backend Crash Recovery
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Live container status and automatic recovery history.
              </p>
            </div>

            <button
              onClick={fetchRecoveryInfo}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Refresh status
            </button>
          </div>

          {recoveryError ? (
            <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              {recoveryError}
            </p>
          ) : recoveryInfo ? (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Container</p>
                  <p className="mt-1 font-semibold">{recoveryInfo.container}</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Container status</p>
                  <p className="mt-1 font-semibold capitalize">
                    {recoveryInfo.status}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Health: {recoveryInfo.health}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Docker restart count</p>
                  <p className="mt-1 text-2xl font-bold">
                    {recoveryInfo.restartCount ?? "Unavailable"}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold text-slate-900">
                  Recovery event history
                </h3>

                {!recoveryInfo.events?.length ? (
                  <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    No crash or recovery events have been captured since the monitor
                    started. The restart count above comes directly from Docker.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {recoveryInfo.events.map((event, index) => (
                      <div
                        key={`${event.timestamp}-${index}`}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold capitalize text-slate-800">
                            {event.type === "crash"
                              ? "Crash detected"
                              : event.type === "recovered"
                                ? "Automatic restart"
                                : event.type}
                          </span>

                          <span className="text-xs text-slate-500">
                            {new Date(event.timestamp).toLocaleString()}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-slate-600">
                          {event.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="mt-5 text-sm text-slate-500">
              Loading Docker recovery information...
            </p>
          )}
        </section>



        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
                Inventory recovery
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                Automatic Restocking
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Manage real restock requests and confirm inventory recovery.
              </p>
            </div>

            <button
              onClick={refreshInventoryData}
              disabled={Boolean(restockActionId)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Refresh requests
            </button>
          </div>

          {restockMessage && (
            <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              {restockMessage}
            </div>
          )}

          {restockError && (
            <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {restockError}
            </div>
          )}

          {restocks.length === 0 ? (
            <div className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
              No restock requests currently. SHCom will create a request when a
              successful order leaves a product with 2 or fewer units.
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {restocks.map((restock) => (
                <div
                  key={restock._id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                  <div className="flex h-44 items-center justify-center bg-slate-50">
                    <img
                      src={
                        restock.product?.image ||
                        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600"
                      }
                      alt={restock.product?.name || "Product"}
                      className="h-full w-full object-contain p-4"
                    />
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {restock.product?.name || "Product unavailable"}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Requested quantity: {restock.requestedQuantity}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Current stock: {restock.product?.stock ?? "Unavailable"}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${restock.status === "delivered"
                          ? "bg-emerald-100 text-emerald-800"
                          : restock.status === "requested"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                          }`}
                      >
                        {restock.status === "requested"
                          ? "Awaiting delivery"
                          : restock.status === "delivered"
                            ? "Delivered"
                            : "Cancelled"}
                      </span>
                    </div>

                    {restock.status === "requested" && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => confirmRestockDelivery(restock._id)}
                          disabled={Boolean(restockActionId)}
                          className="flex-1 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {restockActionId === restock._id
                            ? "Processing..."
                            : "Confirm Delivery"}
                        </button>

                        <button
                          onClick={() => cancelRestock(restock._id)}
                          disabled={Boolean(restockActionId)}
                          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section id="products" className="mt-14">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
                The collection
              </p>
              <h2 className="mt-2 text-3xl font-bold">Shop products</h2>
              <p className="mt-2 text-slate-500">
                Simple shopping. Reliable transactions.
              </p>
            </div>

            <button
              onClick={fetchProducts}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-slate-100"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-500">
              Loading products...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle size={20} />
                Connection error
              </div>

              <p className="mt-2 text-sm">{error}</p>

              <button
                onClick={fetchProducts}
                className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-white"
              >
                Try again
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <Package className="mx-auto text-slate-400" size={40} />
              <h3 className="mt-4 text-lg font-semibold">
                No products yet
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Add a product through the API to see it here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <article
                  key={product._id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="flex h-44 items-center justify-center bg-slate-100">
                    <img
                      src={
                        product.image ||
                        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600"
                      }
                      alt={product.name}
                      className="h-full w-full object-contain p-4"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>

                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                      {product.category}
                    </p>

                    <h3 className="mt-2 text-lg font-bold">
                      {product.name}
                    </h3>

                    <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">
                      {product.description || "Explore this product."}
                    </p>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xl font-bold">
                        ₹{product.price.toLocaleString("en-IN")}
                      </span>


                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`text-xs font-semibold ${product.stock === 0
                            ? "text-red-600"
                            : product.stock <= 2
                              ? "text-amber-600"
                              : "text-slate-500"
                            }`}
                        >
                          {product.stock === 0
                            ? "Out of stock"
                            : product.stock <= 2
                              ? `Low stock: ${product.stock} left`
                              : `${product.stock} in stock`}
                        </span>

                        {product.stock <= 2 && product.stock > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                            Restock threshold reached
                          </span>
                        )}
                      </div>

                    </div>
                    <Link
                      to={`/products/${product._id}`}
                      className="mt-3 flex w-full items-center justify-center rounded-xl border border-emerald-800 px-4 py-3 font-semibold text-emerald-800 transition hover:bg-emerald-50"
                    >
                      View Details
                    </Link>
                    <button
                      onClick={() => addToCart(product)}
                      disabled={product.stock < 1}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <ShoppingBag size={17} />
                      {product.stock > 0 ? "Add to cart" : "Out of stock"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-16 border-t border-slate-200 py-7 text-center text-sm text-slate-500">
          <p>SHCom — Self-Healing Commerce</p>
          <p className="mt-1">
            Building more resilient e-commerce, one recovery at a time.
          </p>
        </footer>
      </main>
    </div>
  );
}

function StatusCard({ icon, title, description, status }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-emerald-50 p-3 text-emerald-800">
          {icon}
        </div>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {status}
        </span>
      </div>

      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Storefront />} />
        <Route path="/products/:id" element={<ProductDetails />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/orders" element={<OrderHistory />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;