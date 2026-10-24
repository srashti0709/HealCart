
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  ShieldCheck,
  RefreshCw,
  Package,
  AlertCircle,
  LoaderCircle,
  ServerCrash,
} from "lucide-react";
import useStorefrontAvailability from "../hooks/useStorefrontAvailability";
import { AVAILABILITY_STATUS } from "../hooks/useBackendAvailability";

const formatTime = (value) => {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
};

function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="h-44 animate-pulse bg-slate-100" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-6 w-24 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

export default function Storefront() {
  const {
    status,
    products,
    catalogLoadedAt,
    checking,
    error,
    refresh,
  } = useStorefrontAvailability();

  const isRecovering = status === AVAILABILITY_STATUS.RECOVERING;
  const isUnavailable = status === AVAILABILITY_STATUS.UNAVAILABLE;
  const isDisrupted = isRecovering || isUnavailable;
  const hasCatalog = products.length > 0;

  const showSkeleton =
    !hasCatalog &&
    (status === AVAILABILITY_STATUS.CHECKING || checking);

  const addToCart = (product) => {
    window.dispatchEvent(
      new CustomEvent("shcom-cart-add", {
        detail: {
          productId: product._id,
          name: product.name,
          price: product.price,
          quantity: 1,
          image: product.image || "",
          stock: product.stock,
        },
      })
    );
  };

  return (
    <main className="lavender-commerce mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
      <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-7 py-12 text-white shadow-xl shadow-violet-200/50 sm:px-12 sm:py-16">
        <div className="relative z-[1] max-w-2xl">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-emerald-100">
            <ShieldCheck size={16} />
            GEAR UP YOUR SETUP
          </span>

          <h2 className="text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
            Upgrade your tech experience.
            <br />
            Make every setup feel extraordinary.
          </h2>

          <p className="mt-5 max-w-xl leading-7 text-emerald-100">
            Discover thoughtful tech essentials for focused work, immersive play, and
            a cleaner, more capable everyday setup.
          </p>

          <a
            href="#products"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-emerald-950 transition hover:bg-emerald-50"
          >
            Shop the collection
            <ShoppingBag size={18} />
          </a>
        </div>

        <div className="absolute -right-12 -top-16 h-72 w-72 rounded-full border border-emerald-400/20" />
        <div className="absolute -bottom-36 right-20 h-80 w-80 rounded-full border border-emerald-400/20" />
      </section>

      <section id="products" className="mt-14">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
              The collection
            </p>
            <h2 className="mt-2 text-3xl font-bold">Shop products</h2>
            <p className="mt-2 text-slate-500">
              Browse reliable essentials and check inventory before you add to cart.
            </p>
          </div>

          <button
            onClick={refresh}
            disabled={checking}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={checking ? "animate-spin text-emerald-700" : ""}
            />
            {checking ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {isDisrupted && hasCatalog && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertCircle
              size={18}
              className="mt-0.5 shrink-0 text-amber-700"
            />
            <p className="text-sm text-amber-900">
              {isRecovering
                ? "Service is being restored, so stock levels and checkout may be out of date."
                : "The store backend is unavailable, so stock levels and checkout may be out of date."}{" "}
              Showing the catalog last loaded at{" "}
              <span className="font-medium">
                {formatTime(catalogLoadedAt) || "an earlier time"}
              </span>
              .
            </p>
          </div>
        )}

        {showSkeleton ? (
          <div
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            aria-busy="true"
            aria-label="Loading products"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        ) : !hasCatalog && isDisrupted ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              {isRecovering ? (
                <LoaderCircle size={24} className="animate-spin" />
              ) : (
                <ServerCrash size={24} />
              )}
            </span>

            <h3 className="mt-5 text-lg font-semibold text-slate-900">
              {isRecovering
                ? "Restoring the store catalog"
                : "The store is temporarily offline"}
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              {isRecovering
                ? "The backend is restarting after a failure. We check it automatically, so the catalog will reappear on its own."
                : "We could not reach the store backend, so the catalog cannot be loaded right now. This page keeps checking and will reload the products automatically."}
            </p>

            {error ? (
              <p className="mx-auto mt-4 max-w-md rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Last check: {error}
              </p>
            ) : null}

            <button
              onClick={refresh}
              disabled={checking}
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={checking ? "animate-spin" : ""}
              />
              {checking ? "Checking..." : "Check again"}
            </button>
          </div>
        ) : !hasCatalog ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <Package className="mx-auto text-slate-400" size={40} />
            <h3 className="mt-4 text-lg font-semibold">No products yet</h3>
            <p className="mt-2 text-sm text-slate-500">
              Products will appear here when they are available in the catalog.
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
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>

                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                      {product.category}
                    </p>
                    {product.isRaceTestProduct && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                        Chaos test · stock 1
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2 text-lg font-bold">{product.name}</h3>

                  <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">
                    {product.description || "Explore this product."}
                  </p>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xl font-bold">
                      ₹{Number(product.price).toLocaleString("en-IN")}
                    </span>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-xs font-semibold ${
                          product.stock === 0
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
                    to={`/user/products/${product._id}`}
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
    </main>
  );
}
