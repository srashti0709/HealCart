
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  ShieldCheck,
  RefreshCw,
  Package,
  AlertCircle,
  LoaderCircle,
  ServerCrash,
  Search,
  ArrowRight,
  ArrowDown,
  Headphones,
  Keyboard,
  Monitor,
  Mouse,
  Heart,
  SlidersHorizontal,
  Sparkles,
  CheckCircle2,
  Truck,
  ShieldCheck as Shield,
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

const formatPrice = (price) =>
  `₹${Number(price || 0).toLocaleString("en-IN")}`;

const getCategoryName = (category) => {
  if (!category) return "Other";

  return String(category)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const getCategoryIcon = (category) => {
  const value = String(category || "").toLowerCase();

  if (value.includes("keyboard")) return Keyboard;
  if (value.includes("mouse") || value.includes("mice")) return Mouse;
  if (value.includes("audio") || value.includes("headphone")) {
    return Headphones;
  }
  if (value.includes("monitor") || value.includes("display")) {
    return Monitor;
  }

  return Package;
};

function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm">
      <div className="h-56 animate-pulse bg-gradient-to-br from-violet-100 via-purple-50 to-fuchsia-100" />

      <div className="space-y-4 p-6">
        <div className="h-4 w-24 animate-pulse rounded-full bg-violet-100" />
        <div className="h-6 w-3/4 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-4 w-full animate-pulse rounded-lg bg-slate-100" />
        <div className="h-4 w-2/3 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-8 w-28 animate-pulse rounded-lg bg-violet-100" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-violet-100" />
      </div>
    </div>
  );
}

function ProductImage({ product }) {
  const [imageFailed, setImageFailed] = useState(false);
  const CategoryIcon = getCategoryIcon(product.category);

  return (
    <div className="group/image relative flex h-56 items-center justify-center overflow-hidden rounded-t-3xl bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-100 p-5 sm:h-60">
      <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/60 blur-2xl" />
      <div className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-violet-200/50 blur-2xl" />

      {!product.image || imageFailed ? (
        <div className="relative flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-white/80 bg-white/75 text-violet-600 shadow-lg shadow-violet-200/40 transition duration-300 group-hover/image:scale-105">
            <CategoryIcon size={44} strokeWidth={1.5} />
          </div>
          <span className="max-w-full text-base font-semibold text-violet-900">
            {product.name}
          </span>
        </div>
      ) : (
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="relative h-full w-full object-contain transition duration-500 group-hover/image:scale-105"
          onError={() => setImageFailed(true)}
        />
      )}

      <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-base font-semibold text-violet-800 shadow-sm backdrop-blur">
        <Sparkles size={16} />
        SHCom pick
      </span>
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

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortMode, setSortMode] = useState("featured");
  const [wishlist, setWishlist] = useState([]);

  const isRecovering = status === AVAILABILITY_STATUS.RECOVERING;
  const isUnavailable = status === AVAILABILITY_STATUS.UNAVAILABLE;
  const isDisrupted = isRecovering || isUnavailable;

  const catalogProducts = Array.isArray(products) ? products : [];
  const hasCatalog = catalogProducts.length > 0;

  const showSkeleton =
    !hasCatalog &&
    (status === AVAILABILITY_STATUS.CHECKING || checking);

  const categories = useMemo(() => {
    const uniqueCategories = [
      ...new Set(
        catalogProducts
          .map((product) => product.category)
          .filter(Boolean)
      ),
    ];

    return uniqueCategories.sort((a, b) =>
      getCategoryName(a).localeCompare(getCategoryName(b))
    );
  }, [catalogProducts]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = catalogProducts.filter((product) => {
      const matchesCategory =
        activeCategory === "all" ||
        String(product.category || "").toLowerCase() === activeCategory;

      const searchableText = [
        product.name,
        product.category,
        product.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchableText.includes(query);
      const stock = Number(product.stock || 0);
      const matchesStock = !inStockOnly || stock > 0;

      return matchesCategory && matchesSearch && matchesStock;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "price-asc") {
        return Number(a.price || 0) - Number(b.price || 0);
      }

      if (sortMode === "price-desc") {
        return Number(b.price || 0) - Number(a.price || 0);
      }

      if (sortMode === "stock") {
        return Number(b.stock || 0) - Number(a.stock || 0);
      }

      return 0;
    });
  }, [
    catalogProducts,
    searchQuery,
    activeCategory,
    inStockOnly,
    sortMode,
  ]);

  const spotlightProduct = catalogProducts[0];

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

  const toggleWishlist = (productId) => {
    setWishlist((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  };

  const resetFilters = () => {
    setSearchQuery("");
    setActiveCategory("all");
    setInStockOnly(false);
    setSortMode("featured");
  };

  return (
    <main className="min-h-screen bg-[#fdfaff] text-[#24183e]">
      <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-7 sm:px-6 lg:px-10">
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-white px-4 py-4 shadow-sm shadow-violet-100/50 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${
                status === AVAILABILITY_STATUS.HEALTHY ||
                status === AVAILABILITY_STATUS.RECONNECTED
                  ? "bg-emerald-500"
                  : isDisrupted
                    ? "bg-amber-500"
                    : "animate-pulse bg-violet-500"
              }`}
            />

            <span className="text-base font-bold text-violet-950">
              {status === AVAILABILITY_STATUS.HEALTHY ||
              status === AVAILABILITY_STATUS.RECONNECTED
                ? "Store connection active"
                : isRecovering
                  ? "Store recovery in progress"
                  : isUnavailable
                    ? "Store connection interrupted"
                    : "Checking store connection"}
            </span>

            <span className="hidden text-violet-200 sm:inline">|</span>

            <span className="text-base text-slate-600">
              {isDisrupted
                ? "Previously loaded products remain available to browse."
                : "Your everyday tech, thoughtfully selected."}
            </span>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={checking}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-base font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={18}
              className={checking ? "animate-spin" : ""}
            />
            {checking ? "Checking..." : "Refresh status"}
          </button>
        </section>

        <section className="relative isolate overflow-hidden rounded-[2rem] border border-violet-100 bg-gradient-to-br from-[#f0eaff] via-[#f9f3ff] to-[#eee8ff] shadow-xl shadow-violet-200/40">
          <div className="absolute -right-20 -top-20 -z-10 h-80 w-80 rounded-full bg-fuchsia-200/50 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 -z-10 h-80 w-80 rounded-full bg-violet-200/70 blur-3xl" />

          <div className="grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-12 lg:gap-10 lg:p-14">
            <div className="lg:col-span-7">
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/75 px-4 py-2 text-base font-bold text-violet-800 shadow-sm">
                <ShieldCheck size={19} />
                TECH THAT WORKS HARDER
              </span>

              <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-[#24183e] sm:text-5xl lg:text-6xl">
                Engineered for precision.
                <span className="mt-1 block bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
                  Built to heal.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700 sm:text-xl">
                Find the tech that fits your setup, from everyday essentials
                to the gear that makes every click, call, and creation feel
                better.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="#products"
                  className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-violet-700 px-6 py-4 text-base font-bold text-white shadow-lg shadow-violet-300/60 transition hover:-translate-y-0.5 hover:bg-violet-800"
                >
                  Explore the collection
                  <ArrowDown size={20} />
                </a>

                <button
                  type="button"
                  onClick={refresh}
                  disabled={checking}
                  className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl border border-violet-200 bg-white/80 px-6 py-4 text-base font-bold text-violet-800 transition hover:bg-white disabled:opacity-60"
                >
                  <RefreshCw
                    size={19}
                    className={checking ? "animate-spin" : ""}
                  />
                  Check availability
                </button>
              </div>

              <div className="mt-9 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm">
                  <Package className="mb-3 text-violet-700" size={24} />
                  <p className="text-base font-bold text-violet-950">
                    Real inventory
                  </p>
                  <p className="mt-1 text-base leading-6 text-slate-600">
                    Stock from your live catalog
                  </p>
                </div>

                <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm">
                  <RefreshCw className="mb-3 text-violet-700" size={24} />
                  <p className="text-base font-bold text-violet-950">
                    Self-healing core
                  </p>
                  <p className="mt-1 text-base leading-6 text-slate-600">
                    Automatic service recovery checks
                  </p>
                </div>

                <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm">
                  <ShoppingBag className="mb-3 text-violet-700" size={24} />
                  <p className="text-base font-bold text-violet-950">
                    Easy shopping
                  </p>
                  <p className="mt-1 text-base leading-6 text-slate-600">
                    Browse, compare, and add to cart
                  </p>
                </div>
              </div>
            </div>

            <div className="relative lg:col-span-5">
              <div className="absolute -right-4 top-8 h-28 w-28 rounded-full bg-fuchsia-300/50 blur-2xl" />

              <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/80 p-4 shadow-2xl shadow-violet-300/40 backdrop-blur sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-bold uppercase tracking-wide text-violet-700">
                      From your catalog
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-violet-950">
                      Featured product
                    </h2>
                  </div>

                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                    <Sparkles size={23} />
                  </span>
                </div>

                {spotlightProduct ? (
                  <>
                    <div className="overflow-hidden rounded-2xl">
                      <ProductImage product={spotlightProduct} />
                    </div>

                    <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-violet-700">
                          {getCategoryName(spotlightProduct.category)}
                        </p>
                        <h3 className="mt-1 break-words text-xl font-bold text-violet-950 sm:text-2xl">
                          {spotlightProduct.name}
                        </h3>
                        <p className="mt-2 text-2xl font-bold text-violet-800">
                          {formatPrice(spotlightProduct.price)}
                        </p>
                      </div>

                      <Link
                        to={`/user/products/${spotlightProduct._id}`}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-base font-bold text-white transition hover:bg-violet-800"
                      >
                        View item
                        <ArrowRight size={18} />
                      </Link>
                    </div>

                    <div className="mt-5 flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-3 text-base font-semibold text-violet-800">
                      <CheckCircle2 size={19} />
                      Live product data from SHCom
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl bg-violet-50 p-6 text-center">
                    <Package size={44} className="text-violet-500" />
                    <p className="mt-4 text-lg font-bold text-violet-950">
                      Your next favorite starts here
                    </p>
                    <p className="mt-2 text-base leading-6 text-slate-600">
                      The featured product will appear when the catalog is
                      available.
                    </p>
                  </div>
                )}
              </div>

              <div className="relative mx-auto -mt-3 flex w-fit flex-wrap items-center justify-center gap-3 rounded-2xl border border-violet-100 bg-white px-5 py-3 shadow-lg sm:gap-4">
                <span className="flex items-center gap-2 text-base font-semibold text-violet-800">
                  <Shield size={19} />
                  Resilient storefront
                </span>
                <span className="hidden h-5 w-px bg-violet-200 sm:block" />
                <span className="flex items-center gap-2 text-base font-semibold text-violet-800">
                  <RefreshCw size={18} />
                  Recovery monitoring
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14" aria-label="Shop by category">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-base font-bold uppercase tracking-widest text-violet-700">
                Find your fit
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-violet-950 sm:text-4xl">
                Shop by category
              </h2>
            </div>

            <a
              href="#products"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-base font-bold text-violet-700 transition hover:bg-violet-50"
            >
              Browse all products
              <ArrowRight size={19} />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <button
              type="button"
              onClick={() => {
                setActiveCategory("all");
                document.getElementById("products")?.scrollIntoView({
                  behavior: "smooth",
                });
              }}
              className={`group flex min-h-32 flex-col items-start justify-between rounded-2xl border p-5 text-left transition hover:-translate-y-1 hover:shadow-lg ${
                activeCategory === "all"
                  ? "border-violet-300 bg-violet-100 shadow-md shadow-violet-100"
                  : "border-violet-100 bg-white hover:border-violet-200"
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white">
                <ShoppingBag size={24} />
              </span>
              <span className="mt-4 text-base font-bold text-violet-950">
                All products
              </span>
            </button>

            {categories.map((category) => {
              const CategoryIcon = getCategoryIcon(category);
              const categoryKey = String(category).toLowerCase();
              const isActive = activeCategory === categoryKey;

              return (
                <button
                  type="button"
                  key={categoryKey}
                  onClick={() => {
                    setActiveCategory(categoryKey);
                    document.getElementById("products")?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                  className={`group flex min-h-32 flex-col items-start justify-between rounded-2xl border p-5 text-left transition hover:-translate-y-1 hover:shadow-lg ${
                    isActive
                      ? "border-violet-300 bg-violet-100 shadow-md shadow-violet-100"
                      : "border-violet-100 bg-white hover:border-violet-200"
                  }`}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white">
                    <CategoryIcon size={24} />
                  </span>

                  <span className="mt-4 break-words text-left text-base font-bold text-violet-950">
                    {getCategoryName(category)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section id="products" className="mt-16 scroll-mt-8">
          <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-base font-bold uppercase tracking-widest text-violet-700">
                The collection
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-violet-950 sm:text-4xl">
                Find your next favorite
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Explore the products in your catalog, compare prices, and
                check current stock before adding an item to your cart.
              </p>
            </div>

            <button
              type="button"
              onClick={refresh}
              disabled={checking}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-5 py-3 text-base font-bold text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={19}
                className={checking ? "animate-spin" : ""}
              />
              {checking ? "Refreshing..." : "Refresh catalog"}
            </button>
          </div>

          {isDisrupted && hasCatalog && (
            <div
              role="status"
              className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5"
            >
              <AlertCircle
                size={23}
                className="mt-0.5 shrink-0 text-amber-700"
              />
              <div>
                <p className="text-base font-bold text-amber-950">
                  {isRecovering
                    ? "SHCom is recovering"
                    : "The store backend is unavailable"}
                </p>
                <p className="mt-1 text-base leading-7 text-amber-900">
                  {isRecovering
                    ? "The service is being restored. The products already loaded remain visible, but inventory and checkout information may be out of date."
                    : "The store backend could not be reached. You can still browse the previously loaded catalog, but inventory and checkout information may be out of date."}
                </p>
                <p className="mt-2 text-base text-amber-900">
                  Last catalog load:{" "}
                  <span className="font-bold">
                    {formatTime(catalogLoadedAt) || "Not available"}
                  </span>
                </p>
              </div>
            </div>
          )}

          <div className="mb-7 rounded-3xl border border-violet-100 bg-white p-4 shadow-sm shadow-violet-100/50 sm:p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
              <label className="relative block">
                <span className="sr-only">Search products</span>
                <Search
                  size={21}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-violet-500"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search products, categories, or descriptions..."
                  className="min-h-14 w-full rounded-2xl border border-violet-100 bg-[#fcfaff] py-3 pl-12 pr-4 text-base text-violet-950 outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />
              </label>

              <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-violet-100 bg-[#fcfaff] px-4 py-3 text-base font-semibold text-violet-950">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(event) => setInStockOnly(event.target.checked)}
                  className="h-5 w-5 accent-violet-700"
                />
                In-stock only
              </label>

              <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-violet-100 bg-[#fcfaff] px-4 py-3">
                <SlidersHorizontal size={20} className="shrink-0 text-violet-600" />
                <span className="text-base font-semibold text-violet-950">
                  Sort
                </span>
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold text-violet-800 outline-none"
                >
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="stock">Stock available</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCategory("all")}
                  className={`min-h-11 rounded-full px-4 py-2 text-base font-bold transition ${
                    activeCategory === "all"
                      ? "bg-violet-700 text-white"
                      : "bg-violet-50 text-violet-800 hover:bg-violet-100"
                  }`}
                >
                  All categories
                </button>

                {categories.map((category) => {
                  const categoryKey = String(category).toLowerCase();

                  return (
                    <button
                      type="button"
                      key={categoryKey}
                      onClick={() => setActiveCategory(categoryKey)}
                      className={`min-h-11 rounded-full px-4 py-2 text-base font-semibold transition ${
                        activeCategory === categoryKey
                          ? "bg-violet-700 text-white"
                          : "bg-violet-50 text-violet-800 hover:bg-violet-100"
                      }`}
                    >
                      {getCategoryName(category)}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={resetFilters}
                className="min-h-11 rounded-xl px-3 py-2 text-base font-semibold text-violet-700 transition hover:bg-violet-50"
              >
                Reset filters
              </button>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-base text-slate-600">
              Showing{" "}
              <span className="font-bold text-violet-950">
                {filteredProducts.length}
              </span>{" "}
              {filteredProducts.length === 1 ? "product" : "products"}
            </p>

            <p className="flex items-center gap-2 text-base font-semibold text-violet-700">
              <ShieldCheck size={19} />
              Inventory-aware shopping
            </p>
          </div>

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
            <div className="rounded-3xl border border-amber-200 bg-white px-6 py-12 text-center shadow-sm sm:px-10">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                {isRecovering ? (
                  <LoaderCircle size={31} className="animate-spin" />
                ) : (
                  <ServerCrash size={31} />
                )}
              </span>

              <h3 className="mt-5 text-2xl font-bold text-violet-950">
                {isRecovering
                  ? "Restoring your store"
                  : "The store is temporarily offline"}
              </h3>

              <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-slate-600">
                {isRecovering
                  ? "The backend is restarting after a failure. SHCom continues checking availability so the catalog can return when the service recovers."
                  : "We could not reach the store backend, so products cannot be loaded right now. This page can check again without requiring you to reload it manually."}
              </p>

              {error ? (
                <p className="mx-auto mt-4 max-w-2xl break-words rounded-xl bg-violet-50 p-4 text-base leading-7 text-slate-700">
                  Last check: {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={refresh}
                disabled={checking}
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-base font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={19}
                  className={checking ? "animate-spin" : ""}
                />
                {checking ? "Checking..." : "Check again"}
              </button>
            </div>
          ) : !hasCatalog ? (
            <div className="rounded-3xl border border-dashed border-violet-200 bg-white px-6 py-16 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                <Package size={32} />
              </span>

              <h3 className="mt-5 text-2xl font-bold text-violet-950">
                Your collection starts here
              </h3>

              <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-slate-600">
                No products are currently available in the catalog. Products
                will appear here when they are added to SHCom.
              </p>

              <button
                type="button"
                onClick={refresh}
                disabled={checking}
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-violet-200 px-5 py-3 text-base font-bold text-violet-800 transition hover:bg-violet-50 disabled:opacity-60"
              >
                <RefreshCw
                  size={19}
                  className={checking ? "animate-spin" : ""}
                />
                {checking ? "Checking..." : "Refresh catalog"}
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-3xl border border-violet-100 bg-white px-6 py-14 text-center shadow-sm">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <Search size={30} />
              </span>

              <h3 className="mt-5 text-2xl font-bold text-violet-950">
                No matching products
              </h3>

              <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-slate-600">
                Try another search, choose a different category, or turn off
                the in-stock filter to see more of your catalog.
              </p>

              <button
                type="button"
                onClick={resetFilters}
                className="mt-6 min-h-12 rounded-xl bg-violet-700 px-5 py-3 text-base font-bold text-white transition hover:bg-violet-800"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const stock = Number(product.stock || 0);
                const isLowStock = stock > 0 && stock <= 2;
                const isWishlisted = wishlist.includes(product._id);

                return (
                  <article
                    key={product._id}
                    className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm shadow-violet-100/50 transition duration-300 hover:-translate-y-1 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-200/40"
                  >
                    <div className="relative">
                      <ProductImage product={product} />

                      <button
                        type="button"
                        aria-label={
                          isWishlisted
                            ? `Remove ${product.name} from wishlist`
                            : `Add ${product.name} to wishlist`
                        }
                        aria-pressed={isWishlisted}
                        onClick={() => toggleWishlist(product._id)}
                        className={`absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition ${
                          isWishlisted
                            ? "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700"
                            : "border-white/80 bg-white/90 text-violet-700 hover:bg-violet-100"
                        }`}
                      >
                        <Heart
                          size={21}
                          fill={isWishlisted ? "currentColor" : "none"}
                        />
                      </button>

                      {product.isRaceTestProduct && (
                        <span className="absolute left-4 top-4 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-base font-bold text-amber-900">
                          Chaos test · stock 1
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-5 sm:p-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold uppercase tracking-wide text-violet-700">
                          {getCategoryName(product.category)}
                        </span>

                        {isLowStock && (
                          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-base font-semibold text-amber-900">
                            Low stock
                          </span>
                        )}
                      </div>

                      <h3 className="mt-3 break-words text-xl font-bold leading-snug text-violet-950 transition group-hover:text-violet-700">
                        {product.name}
                      </h3>

                      <p className="mt-3 min-h-14 text-base leading-7 text-slate-600">
                        {product.description || "Explore this product."}
                      </p>

                      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-violet-100 pt-4">
                        <div>
                          <p className="text-2xl font-bold text-violet-950">
                            {formatPrice(product.price)}
                          </p>

                          <p
                            className={`mt-2 flex items-center gap-2 text-base font-semibold ${
                              stock === 0
                                ? "text-red-700"
                                : isLowStock
                                  ? "text-amber-800"
                                  : "text-emerald-700"
                            }`}
                          >
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                stock === 0
                                  ? "bg-red-500"
                                  : isLowStock
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                              }`}
                            />
                            {stock === 0
                              ? "Out of stock"
                              : isLowStock
                                ? `${stock} left in stock`
                                : `${stock} in stock`}
                          </p>
                        </div>

                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-100">
                          <Package size={22} />
                        </span>
                      </div>

                      {isLowStock && (
                        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-base leading-6 text-amber-900">
                          Limited availability. Stock may change during
                          checkout.
                        </p>
                      )}

                      <div className="mt-auto pt-5">
                        <Link
                          to={`/user/products/${product._id}`}
                          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 px-4 py-3 text-base font-bold text-violet-800 transition hover:border-violet-300 hover:bg-violet-50"
                        >
                          View details
                          <ArrowRight size={19} />
                        </Link>

                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          disabled={stock < 1}
                          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-base font-bold text-white shadow-md shadow-violet-200/60 transition hover:bg-violet-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
                        >
                          <ShoppingBag size={20} />
                          {stock > 0 ? "Add to cart" : "Out of stock"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-16 overflow-hidden rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-100 via-purple-50 to-fuchsia-100 p-6 sm:p-10 lg:p-12">
          <div className="mb-8 max-w-3xl">
            <p className="text-base font-bold uppercase tracking-widest text-violet-700">
              The SHCom advantage
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-violet-950 sm:text-4xl">
              A storefront designed to recover, not give up.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-700 sm:text-lg">
              SHCom combines a practical shopping experience with availability
              checks and recovery-aware messaging, helping customers understand
              when the store needs a moment to recover.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-white bg-white/85 p-6 shadow-sm">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <RefreshCw size={27} />
              </span>
              <h3 className="mt-5 text-xl font-bold text-violet-950">
                Recovery-aware experience
              </h3>
              <p className="mt-3 text-base leading-7 text-slate-600">
                The storefront reflects backend availability and provides
                recovery messages when service interruptions occur.
              </p>
            </div>

            <div className="rounded-2xl border border-white bg-white/85 p-6 shadow-sm">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-100 text-fuchsia-700">
                <Package size={27} />
              </span>
              <h3 className="mt-5 text-xl font-bold text-violet-950">
                Inventory visibility
              </h3>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Product cards show catalog stock information, including
                low-stock and unavailable states.
              </p>
            </div>

            <div className="rounded-2xl border border-white bg-white/85 p-6 shadow-sm">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                <Truck size={27} />
              </span>
              <h3 className="mt-5 text-xl font-bold text-violet-950">
                Clear shopping flow
              </h3>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Browse products, open details, check availability, and add
                items using your existing SHCom cart integration.
              </p>
            </div>
          </div>
        </section>

        <footer className="mt-12 flex flex-col gap-4 border-t border-violet-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-bold text-violet-950">SHCom</p>
            <p className="mt-1 text-base leading-6 text-slate-600">
              Self-Healing Commerce
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/user/orders"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-base font-semibold text-violet-700 transition hover:bg-violet-50"
            >
              <Package size={19} />
              Order history
            </Link>

            <span className="flex items-center gap-2 text-base text-slate-600">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  status === AVAILABILITY_STATUS.HEALTHY ||
                  status === AVAILABILITY_STATUS.RECONNECTED
                    ? "bg-emerald-500"
                    : isDisrupted
                      ? "bg-amber-500"
                      : "bg-violet-500"
                }`}
              />
              {isRecovering
                ? "Recovery in progress"
                : isUnavailable
                  ? "Service unavailable"
                  : status === AVAILABILITY_STATUS.HEALTHY ||
                      status === AVAILABILITY_STATUS.RECONNECTED
                    ? "Service responding"
                    : "Checking service"}
            </span>
          </div>
        </footer>

        {error && isDisrupted && (
          <p className="mt-4 break-words rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base leading-7 text-amber-950">
            Latest availability check: {error}
          </p>
        )}
      </div>
    </main>
  );
}
