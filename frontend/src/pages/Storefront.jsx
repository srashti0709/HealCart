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
    <div className="overflow-hidden rounded-[1.75rem] border border-violet-100/80 bg-white shadow-[0_12px_35px_-20px_rgba(109,40,217,0.25)]">
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
    <div className="group/image relative flex h-56 items-center justify-center overflow-hidden rounded-t-[1.7rem] bg-gradient-to-br from-[#f1eaff] via-[#faf6ff] to-[#e8dcff] p-5 sm:h-60">
      <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-fuchsia-300/40 blur-3xl transition duration-700 group-hover/image:scale-125" />
      <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-violet-400/30 blur-3xl transition duration-700 group-hover/image:scale-125" />

      <div className="absolute inset-5 rounded-3xl border border-white/50" />

      {!product.image || imageFailed ? (
        <div className="relative flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-[1.8rem] border border-white/90 bg-white/80 text-violet-600 shadow-[0_18px_40px_-15px_rgba(109,40,217,0.4)] transition duration-500 group-hover/image:-translate-y-2 group-hover/image:rotate-3 group-hover/image:scale-105">
            <CategoryIcon size={44} strokeWidth={1.5} />
          </div>
          <span className="max-w-full text-base font-bold text-violet-950">
            {product.name}
          </span>
        </div>
      ) : (
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="relative z-10 h-full w-full object-contain drop-shadow-[0_16px_15px_rgba(76,29,149,0.13)] transition duration-700 ease-out group-hover/image:-translate-y-2 group-hover/image:scale-110"
          onError={() => setImageFailed(true)}
        />
      )}

      

      <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-white/70 bg-white/60 text-violet-600 shadow-sm backdrop-blur-lg">
        <ShieldCheck size={17} />
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
      new CustomEvent("healcart-cart-add", {
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

  const connectionIsHealthy =
    status === AVAILABILITY_STATUS.HEALTHY ||
    status === AVAILABILITY_STATUS.RECONNECTED;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fcfaff] text-[#24183e] selection:bg-violet-200 selection:text-violet-950">
      <div className="pointer-events-none absolute left-0 top-40 -z-0 h-96 w-96 rounded-full bg-violet-200/25 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-[850px] -z-0 h-96 w-96 rounded-full bg-fuchsia-200/20 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-10">
        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white bg-white/80 px-4 py-4 shadow-[0_8px_35px_-20px_rgba(109,40,217,0.3)] ring-1 ring-violet-100/80 backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="relative flex h-3 w-3">
              {!connectionIsHealthy && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${
                    isDisrupted ? "bg-amber-400" : "bg-violet-400"
                  }`}
                />
              )}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  connectionIsHealthy
                    ? "bg-emerald-500"
                    : isDisrupted
                      ? "bg-amber-500"
                      : "bg-violet-500"
                }`}
              />
            </span>

            <span className="text-sm font-extrabold text-violet-950 sm:text-base">
              {connectionIsHealthy
                ? "Store connection active"
                : isRecovering
                  ? "Store recovery in progress"
                  : isUnavailable
                    ? "Store connection interrupted"
                    : "Checking store connection"}
            </span>

            <span className="hidden h-5 w-px bg-violet-200 sm:block" />

            <span className="text-sm text-slate-600 sm:text-base">
              {isDisrupted
                ? "Previously loaded products remain available to browse."
                : "Your everyday tech, thoughtfully selected."}
            </span>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={checking}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/70 px-4 text-sm font-bold text-violet-800 transition duration-300 hover:border-violet-200 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
          >
            <RefreshCw
              size={17}
              className={checking ? "animate-spin" : ""}
            />
            {checking ? "Checking..." : "Refresh status"}
          </button>
        </section>

        <section className="group/hero relative isolate overflow-hidden rounded-[2rem] border border-white bg-gradient-to-br from-[#eee5ff] via-[#faf5ff] to-[#eee9ff] shadow-[0_30px_90px_-35px_rgba(109,40,217,0.32)] ring-1 ring-violet-100/80">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_10%_15%,rgba(255,255,255,0.95),transparent_40%),radial-gradient(ellipse_at_90%_80%,rgba(216,180,254,0.45),transparent_42%)]" />
          <div className="pointer-events-none absolute -right-24 -top-32 -z-10 h-96 w-96 rounded-full border border-white/50 bg-fuchsia-300/15 blur-3xl transition duration-1000 group-hover/hero:scale-110" />
          <div className="pointer-events-none absolute -bottom-36 left-1/4 -z-10 h-96 w-96 rounded-full bg-violet-300/25 blur-3xl" />

          <div className="grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-12 lg:gap-8 lg:p-14">
            <div className="lg:col-span-7">
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/90 bg-white/75 px-4 py-2 text-xs font-extrabold tracking-[0.16em] text-violet-800 shadow-sm backdrop-blur-xl sm:text-sm">
                <ShieldCheck size={17} />
                TECH THAT WORKS HARDER
                <span className="h-1 w-1 rounded-full bg-violet-400" />
                BUILT TO LAST
              </span>

              <h1 className="max-w-3xl text-4xl font-black leading-[1.12] tracking-[-0.045em] text-[#24183e] sm:text-5xl lg:text-[4.25rem]">
                Engineered for precision.
                <span className="mt-2 block bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 bg-clip-text pb-2 text-transparent">
                  Built to heal.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                Find the tech that fits your setup, from everyday essentials
                to the gear that makes every click, call, and creation feel
                better.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#products"
                  className="group/cta inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-violet-700 to-violet-900 px-6 py-4 text-sm font-extrabold text-white shadow-[0_12px_28px_-8px_rgba(109,40,217,0.65)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_35px_-8px_rgba(109,40,217,0.65)] sm:text-base"
                >
                  Explore the collection
                  <ArrowDown
                    size={19}
                    className="transition duration-300 group-hover/cta:translate-y-1"
                  />
                </a>

                <button
                  type="button"
                  onClick={refresh}
                  disabled={checking}
                  className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl border border-white bg-white/75 px-6 py-4 text-sm font-bold text-violet-800 shadow-sm backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-white disabled:opacity-60 sm:text-base"
                >
                  <RefreshCw
                    size={18}
                    className={checking ? "animate-spin" : ""}
                  />
                  Check availability
                </button>
              </div>

              <div className="mt-9 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="group/feature rounded-2xl border border-white/90 bg-white/65 p-4 shadow-[0_10px_25px_-20px_rgba(76,29,149,0.4)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/90">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 shadow-sm transition duration-300 group-hover/feature:rotate-3 group-hover/feature:scale-110">
                    <Package size={22} />
                  </span>
                  <p className="text-sm font-extrabold text-violet-950 sm:text-base">
                    Real inventory
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Stock from your live catalog
                  </p>
                </div>

                <div className="group/feature rounded-2xl border border-white/90 bg-white/65 p-4 shadow-[0_10px_25px_-20px_rgba(76,29,149,0.4)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/90">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-100 text-fuchsia-700 shadow-sm transition duration-300 group-hover/feature:rotate-3 group-hover/feature:scale-110">
                    <RefreshCw size={22} />
                  </span>
                  <p className="text-sm font-extrabold text-violet-950 sm:text-base">
                    Self-healing core
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Automatic recovery checks
                  </p>
                </div>

                <div className="group/feature rounded-2xl border border-white/90 bg-white/65 p-4 shadow-[0_10px_25px_-20px_rgba(76,29,149,0.4)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/90">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 shadow-sm transition duration-300 group-hover/feature:rotate-3 group-hover/feature:scale-110">
                    <ShoppingBag size={22} />
                  </span>
                  <p className="text-sm font-extrabold text-violet-950 sm:text-base">
                    Easy shopping
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Browse, compare, and shop
                  </p>
                </div>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:col-span-5 lg:max-w-none">
              <div className="pointer-events-none absolute -right-4 top-5 h-36 w-36 rounded-full bg-fuchsia-300/45 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-5 -left-4 h-40 w-40 rounded-full bg-violet-400/25 blur-3xl" />

              <div className="relative rounded-[2rem] border border-white/90 bg-white/55 p-3 shadow-[0_35px_80px_-25px_rgba(91,33,182,0.3)] backdrop-blur-2xl transition duration-500 hover:-translate-y-1 sm:p-5">
                <div className="rounded-[1.55rem] border border-white/90 bg-white/90 p-4 shadow-inner shadow-violet-100/60 sm:p-5">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-violet-600">
                        Curated for you
                      </p>
                      <h2 className="mt-1.5 text-xl font-black tracking-tight text-violet-950 sm:text-2xl">
                        Featured product
                      </h2>
                    </div>

                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-violet-700 shadow-inner shadow-white">
                      <Sparkles size={22} />
                    </span>
                  </div>

                  {spotlightProduct ? (
                    <>
                      <div className="overflow-hidden rounded-[1.5rem] shadow-[0_15px_35px_-20px_rgba(109,40,217,0.35)]">
                        <ProductImage product={spotlightProduct} />
                      </div>

                      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-violet-600">
                            {getCategoryName(spotlightProduct.category)}
                          </p>
                          <h3 className="mt-1.5 break-words text-xl font-extrabold tracking-tight text-violet-950 sm:text-2xl">
                            {spotlightProduct.name}
                          </h3>
                          <p className="mt-2 text-2xl font-black tracking-tight text-violet-800">
                            {formatPrice(spotlightProduct.price)}
                          </p>
                        </div>

                        <Link
                          to={`/user/products/${spotlightProduct._id}`}
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-200 transition duration-300 hover:-translate-y-0.5 hover:bg-violet-800 sm:text-base"
                        >
                          View item
                          <ArrowRight size={17} />
                        </Link>
                      </div>

                      <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm font-bold text-emerald-800">
                        <CheckCircle2 size={18} />
                        Live product data from HealCart
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 text-center">
                      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-violet-500 shadow-lg shadow-violet-200/50">
                        <Package size={34} />
                      </span>
                      <p className="mt-4 text-lg font-extrabold text-violet-950">
                        Your next favorite starts here
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        The featured product will appear when the catalog is
                        available.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative mx-auto -mt-3 flex w-fit flex-wrap items-center justify-center gap-4 rounded-2xl border border-white bg-white/90 px-4 py-3 shadow-[0_15px_35px_-15px_rgba(109,40,217,0.35)] backdrop-blur-xl sm:gap-5 sm:px-5">
                <span className="flex items-center gap-2 text-xs font-extrabold text-violet-800 sm:text-sm">
                  <Shield size={17} />
                  Resilient storefront
                </span>
                <span className="hidden h-5 w-px bg-violet-200 sm:block" />
                <span className="flex items-center gap-2 text-xs font-extrabold text-violet-800 sm:text-sm">
                  <RefreshCw size={16} />
                  Recovery monitoring
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16" aria-label="Shop by category">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-violet-600 sm:text-sm">
                Find your fit
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-violet-950 sm:text-4xl">
                Shop by category
              </h2>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Everything your setup needs, all in one place.
              </p>
            </div>

            <a
              href="#products"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100/70 sm:text-base"
            >
              Browse all products
              <ArrowRight size={18} />
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
              className={`group relative flex min-h-36 flex-col items-start justify-between overflow-hidden rounded-2xl border p-5 text-left transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_35px_-20px_rgba(109,40,217,0.45)] ${
                activeCategory === "all"
                  ? "border-violet-300 bg-gradient-to-br from-violet-100 to-purple-50 shadow-lg shadow-violet-200/50 ring-1 ring-violet-200"
                  : "border-white bg-white shadow-[0_8px_30px_-20px_rgba(109,40,217,0.25)] hover:border-violet-200"
              }`}
            >
              <span className="pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full bg-violet-200/35 blur-2xl transition duration-500 group-hover:scale-150" />
              <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white bg-gradient-to-br from-white to-violet-100 text-violet-700 shadow-sm transition duration-300 group-hover:rotate-3 group-hover:scale-110">
                <ShoppingBag size={23} />
              </span>
              <span className="relative mt-4 text-sm font-extrabold text-violet-950 sm:text-base">
                All products
              </span>
              <span className="relative mt-1 text-xs text-slate-500">
                Explore everything
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
                  className={`group relative flex min-h-36 flex-col items-start justify-between overflow-hidden rounded-2xl border p-5 text-left transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_35px_-20px_rgba(109,40,217,0.45)] ${
                    isActive
                      ? "border-violet-300 bg-gradient-to-br from-violet-100 to-purple-50 shadow-lg shadow-violet-200/50 ring-1 ring-violet-200"
                      : "border-white bg-white shadow-[0_8px_30px_-20px_rgba(109,40,217,0.25)] hover:border-violet-200"
                  }`}
                >
                  <span className="pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full bg-fuchsia-200/30 blur-2xl transition duration-500 group-hover:scale-150" />

                  <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white bg-gradient-to-br from-white to-violet-100 text-violet-700 shadow-sm transition duration-300 group-hover:-rotate-3 group-hover:scale-110">
                    <CategoryIcon size={23} />
                  </span>

                  <span className="relative mt-4 break-words text-left text-sm font-extrabold text-violet-950 sm:text-base">
                    {getCategoryName(category)}
                  </span>

                  <span className="relative mt-1 text-xs text-slate-500">
                    Explore collection
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section id="products" className="mt-16 scroll-mt-8">
          <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-violet-600 sm:text-sm">
                The collection
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-violet-950 sm:text-4xl">
                Find your next favorite
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Explore the products in your catalog, compare prices, and
                check current stock before adding an item to your cart.
              </p>
            </div>

            <button
              type="button"
              onClick={refresh}
              disabled={checking}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-100 bg-white px-5 py-3 text-sm font-extrabold text-violet-800 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
            >
              <RefreshCw
                size={18}
                className={checking ? "animate-spin" : ""}
              />
              {checking ? "Refreshing..." : "Refresh catalog"}
            </button>
          </div>

          {isDisrupted && hasCatalog && (
            <div
              role="status"
              className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-orange-50/70 p-5 shadow-sm shadow-amber-100/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm">
                <AlertCircle size={21} />
              </span>
              <div>
                <p className="text-sm font-extrabold text-amber-950 sm:text-base">
                  {isRecovering
                    ? "HealCart is recovering"
                    : "The store backend is unavailable"}
                </p>
                <p className="mt-1 text-sm leading-7 text-amber-900 sm:text-base">
                  {isRecovering
                    ? "The service is being restored. The products already loaded remain visible, but inventory and checkout information may be out of date."
                    : "The store backend could not be reached. You can still browse the previously loaded catalog, but inventory and checkout information may be out of date."}
                </p>
                <p className="mt-2 text-sm text-amber-900">
                  Last catalog load:{" "}
                  <span className="font-extrabold">
                    {formatTime(catalogLoadedAt) || "Not available"}
                  </span>
                </p>
              </div>
            </div>
          )}

          <div className="mb-7 rounded-[1.75rem] border border-white bg-white/85 p-4 shadow-[0_18px_55px_-35px_rgba(109,40,217,0.35)] ring-1 ring-violet-100/80 backdrop-blur-xl sm:p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
              <label className="relative block">
                <span className="sr-only">Search products</span>
                <Search
                  size={20}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-violet-500"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search products, categories, or descriptions..."
                  className="min-h-14 w-full rounded-2xl border border-violet-100 bg-[#fcfaff] py-3 pl-12 pr-4 text-sm font-medium text-violet-950 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100 sm:text-base"
                />
              </label>

              <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-violet-100 bg-[#fcfaff] px-4 py-3 text-sm font-bold text-violet-950 transition hover:border-violet-200 sm:text-base">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(event) => setInStockOnly(event.target.checked)}
                  className="h-5 w-5 accent-violet-700"
                />
                In-stock only
              </label>

              <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-violet-100 bg-[#fcfaff] px-4 py-3 transition hover:border-violet-200">
                <SlidersHorizontal
                  size={19}
                  className="shrink-0 text-violet-600"
                />
                <span className="text-sm font-bold text-violet-950 sm:text-base">
                  Sort
                </span>
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-violet-800 outline-none sm:text-base"
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
                  className={`min-h-10 rounded-full px-4 py-2 text-sm font-extrabold transition duration-200 sm:text-base ${
                    activeCategory === "all"
                      ? "bg-gradient-to-r from-violet-700 to-violet-800 text-white shadow-md shadow-violet-200"
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
                      className={`min-h-10 rounded-full px-4 py-2 text-sm font-bold transition duration-200 sm:text-base ${
                        activeCategory === categoryKey
                          ? "bg-gradient-to-r from-violet-700 to-violet-800 text-white shadow-md shadow-violet-200"
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
                className="min-h-10 rounded-xl px-3 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-50 sm:text-base"
              >
                Reset filters
              </button>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 sm:text-base">
              Showing{" "}
              <span className="font-extrabold text-violet-950">
                {filteredProducts.length}
              </span>{" "}
              {filteredProducts.length === 1 ? "product" : "products"}
            </p>

            <p className="flex items-center gap-2 rounded-full border border-violet-100 bg-white px-4 py-2 text-xs font-extrabold text-violet-700 shadow-sm sm:text-sm">
              <ShieldCheck size={17} />
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
            <div className="rounded-[2rem] border border-amber-200 bg-white px-6 py-12 text-center shadow-[0_20px_60px_-35px_rgba(180,83,9,0.25)] sm:px-10">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 text-amber-700 shadow-inner">
                {isRecovering ? (
                  <LoaderCircle size={31} className="animate-spin" />
                ) : (
                  <ServerCrash size={31} />
                )}
              </span>

              <h3 className="mt-5 text-2xl font-black text-violet-950">
                {isRecovering
                  ? "Restoring your store"
                  : "The store is temporarily offline"}
              </h3>

              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                {isRecovering
                  ? "The backend is restarting after a failure. HealCart continues checking availability so the catalog can return when the service recovers."
                  : "We could not reach the store backend, so products cannot be loaded right now. This page can check again without requiring you to reload it manually."}
              </p>

              {error ? (
                <p className="mx-auto mt-4 max-w-2xl break-words rounded-xl bg-violet-50 p-4 text-sm leading-7 text-slate-700">
                  Last check: {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={refresh}
                disabled={checking}
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
              >
                <RefreshCw
                  size={18}
                  className={checking ? "animate-spin" : ""}
                />
                {checking ? "Checking..." : "Check again"}
              </button>
            </div>
          ) : !hasCatalog ? (
            <div className="rounded-[2rem] border border-dashed border-violet-200 bg-white px-6 py-16 text-center shadow-sm">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-violet-600 shadow-inner">
                <Package size={32} />
              </span>

              <h3 className="mt-5 text-2xl font-black text-violet-950">
                Your collection starts here
              </h3>

              <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-600 sm:text-base">
                No products are currently available in the catalog. Products
                will appear here when they are added to HealCart.
              </p>

              <button
                type="button"
                onClick={refresh}
                disabled={checking}
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-violet-200 px-5 py-3 text-sm font-extrabold text-violet-800 transition hover:bg-violet-50 disabled:opacity-60 sm:text-base"
              >
                <RefreshCw
                  size={18}
                  className={checking ? "animate-spin" : ""}
                />
                {checking ? "Checking..." : "Refresh catalog"}
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-[2rem] border border-violet-100 bg-white px-6 py-14 text-center shadow-[0_15px_45px_-30px_rgba(109,40,217,0.3)]">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-violet-700 shadow-inner">
                <Search size={30} />
              </span>

              <h3 className="mt-5 text-2xl font-black text-violet-950">
                No matching products
              </h3>

              <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-600 sm:text-base">
                Try another search, choose a different category, or turn off
                the in-stock filter to see more of your catalog.
              </p>

              <button
                type="button"
                onClick={resetFilters}
                className="mt-6 min-h-12 rounded-xl bg-violet-700 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-800 sm:text-base"
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
                    className="group flex min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-white bg-white shadow-[0_12px_40px_-25px_rgba(76,29,149,0.3)] ring-1 ring-violet-100/80 transition duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_28px_55px_-25px_rgba(109,40,217,0.38)] hover:ring-violet-200"
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
                        className={`absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition duration-300 hover:scale-110 ${
                          isWishlisted
                            ? "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700"
                            : "border-white/90 bg-white/90 text-violet-700 hover:bg-white"
                        }`}
                      >
                        <Heart
                          size={20}
                          fill={isWishlisted ? "currentColor" : "none"}
                        />
                      </button>

                      {product.isRaceTestProduct && (
                        <span className="absolute left-4 top-4 z-20 rounded-full border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-extrabold text-amber-900 shadow-sm backdrop-blur sm:text-sm">
                          Chaos test · stock 1
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-5 sm:p-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-600 sm:text-sm">
                          {getCategoryName(product.category)}
                        </span>

                        {isLowStock && (
                          <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                            Low stock
                          </span>
                        )}
                      </div>

                      <h3 className="mt-3 break-words text-lg font-extrabold leading-snug tracking-tight text-violet-950 transition duration-200 group-hover:text-violet-700 sm:text-xl">
                        {product.name}
                      </h3>

                      <p className="mt-3 min-h-14 text-sm leading-7 text-slate-600 sm:text-base">
                        {product.description || "Explore this product."}
                      </p>

                      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-violet-100 pt-4">
                        <div>
                          <p className="text-2xl font-black tracking-tight text-violet-950">
                            {formatPrice(product.price)}
                          </p>

                          <p
                            className={`mt-2 flex items-center gap-2 text-sm font-bold ${
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

                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 text-violet-700 transition duration-300 group-hover:rotate-3 group-hover:scale-110">
                          <Package size={21} />
                        </span>
                      </div>

                      {isLowStock && (
                        <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm leading-6 text-amber-900">
                          Limited availability. Stock may change during
                          checkout.
                        </p>
                      )}

                      <div className="mt-auto pt-5">
                        <Link
                          to={`/user/products/${product._id}`}
                          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-extrabold text-violet-800 transition duration-300 hover:border-violet-300 hover:bg-violet-50 sm:text-base"
                        >
                          View details
                          <ArrowRight
                            size={18}
                            className="transition duration-300 group-hover:translate-x-1"
                          />
                        </Link>

                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          disabled={stock < 1}
                          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-700 to-violet-800 px-4 py-3 text-sm font-extrabold text-white shadow-[0_8px_18px_-8px_rgba(109,40,217,0.65)] transition duration-300 hover:-translate-y-0.5 hover:from-violet-800 hover:to-violet-950 hover:shadow-[0_12px_24px_-8px_rgba(109,40,217,0.6)] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none sm:text-base"
                        >
                          <ShoppingBag size={19} />
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

        <section className="relative mt-16 overflow-hidden rounded-[2rem] border border-white bg-gradient-to-br from-[#eee6ff] via-[#faf5ff] to-[#f4e8ff] p-6 shadow-[0_25px_70px_-35px_rgba(109,40,217,0.3)] ring-1 ring-violet-100/80 sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-fuchsia-300/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-violet-300/30 blur-3xl" />

          <div className="relative z-10 mb-8 max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-violet-700 sm:text-sm">
              The HealCart advantage
            </p>
            <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-violet-950 sm:text-4xl">
              A storefront designed to recover, not give up.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-lg">
              HealCart combines a practical shopping experience with
              availability checks and recovery-aware messaging, helping
              customers understand when the store needs a moment to recover.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="group rounded-2xl border border-white/90 bg-white/75 p-6 shadow-[0_12px_30px_-22px_rgba(76,29,149,0.35)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-xl">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-100 to-white text-violet-700 shadow-sm transition duration-300 group-hover:rotate-3 group-hover:scale-105">
                <RefreshCw size={26} />
              </span>
              <h3 className="mt-5 text-lg font-extrabold text-violet-950 sm:text-xl">
                Recovery-aware experience
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                The storefront reflects backend availability and provides
                recovery messages when service interruptions occur.
              </p>
            </div>

            <div className="group rounded-2xl border border-white/90 bg-white/75 p-6 shadow-[0_12px_30px_-22px_rgba(76,29,149,0.35)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-xl">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fuchsia-100 bg-gradient-to-br from-fuchsia-100 to-white text-fuchsia-700 shadow-sm transition duration-300 group-hover:rotate-3 group-hover:scale-105">
                <Package size={26} />
              </span>
              <h3 className="mt-5 text-lg font-extrabold text-violet-950 sm:text-xl">
                Inventory visibility
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                Product cards show catalog stock information, including
                low-stock and unavailable states.
              </p>
            </div>

            <div className="group rounded-2xl border border-white/90 bg-white/75 p-6 shadow-[0_12px_30px_-22px_rgba(76,29,149,0.35)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-xl">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-100 to-white text-indigo-700 shadow-sm transition duration-300 group-hover:rotate-3 group-hover:scale-105">
                <Truck size={26} />
              </span>
              <h3 className="mt-5 text-lg font-extrabold text-violet-950 sm:text-xl">
                Clear shopping flow
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                Browse products, open details, check availability, and add
                items using your existing HealCart cart integration.
              </p>
            </div>
          </div>
        </section>

        <footer className="mt-12 flex flex-col gap-4 border-t border-violet-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xl font-black tracking-tight text-violet-950">
              HealCart
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Self-Healing Commerce
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link
              to="/user/orders"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100/70 sm:text-base"
            >
              <Package size={18} />
              Order history
            </Link>

            <span className="flex items-center gap-2 rounded-full border border-violet-100 bg-white px-3 py-2 text-xs font-bold text-slate-600 sm:text-sm">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  connectionIsHealthy
                    ? "bg-emerald-500"
                    : isDisrupted
                      ? "bg-amber-500"
                      : "animate-pulse bg-violet-500"
                }`}
              />
              {isRecovering
                ? "Recovery in progress"
                : isUnavailable
                  ? "Service unavailable"
                  : connectionIsHealthy
                    ? "Service responding"
                    : "Checking service"}
            </span>
          </div>
        </footer>

        {error && isDisrupted && (
          <p className="mt-4 break-words rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950 sm:text-base">
            Latest availability check: {error}
          </p>
        )}
      </div>
    </main>
  );
}
