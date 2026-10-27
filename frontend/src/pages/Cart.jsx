
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
    ArrowLeft,
    Minus,
    Plus,
    ShoppingBag,
    Trash2,
    Package,
    ShieldCheck,
    ArrowRight,
    AlertCircle,
    CheckCircle2,
    RefreshCw,
} from "lucide-react";
import { API_ENDPOINTS } from "../config/api";
import { readCart, writeCart } from "../lib/cart";

export default function Cart() {
    const [cart, setCart] = useState(() => readCart());
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [stockNotice, setStockNotice] = useState("");

    useEffect(() => {
        let active = true;

        const fetchProducts = async () => {
            try {
                const response = await axios.get(API_ENDPOINTS.products);

                if (active) {
                    setProducts(response.data.products || []);
                    setError("");
                }
            } catch {
                if (active) {
                    setError(
                        "Unable to load current product and stock information. Please try again."
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        };

        fetchProducts();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        writeCart(cart);
    }, [cart]);

    const cartItems = cart.map((item) => {
        const product = products.find(
            (product) => product._id === item.productId
        );

        return {
            ...item,
            name: product?.name || item.name || "Product",
            price: product?.price ?? item.price ?? 0,
            image: product?.image || item.image || "",
            stock: product?.stock ?? 0,
            available: Boolean(product),
        };
    });

    const updateQuantity = (productId, change) => {
        const item = cartItems.find(
            (item) => item.productId === productId
        );

        if (!item || !item.available) return;

        const newQuantity = item.quantity + change;

        if (newQuantity < 1) return;

        if (newQuantity > item.stock) {
            setStockNotice(
                `Only ${item.stock} units of ${item.name} are currently available.`
            );
            return;
        }

        setStockNotice("");

        setCart((currentCart) =>
            currentCart.map((item) =>
                item.productId === productId
                    ? { ...item, quantity: newQuantity }
                    : item
            )
        );
    };

    const removeItem = (productId) => {
        setStockNotice("");
        setCart((currentCart) =>
            currentCart.filter((item) => item.productId !== productId)
        );
    };

    const clearCart = () => {
        setCart([]);
        setStockNotice("");
    };

    const totalItems = cart.reduce(
        (total, item) => total + item.quantity,
        0
    );

    const subtotal = cartItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
    );

    const unavailableItems = cartItems.filter(
        (item) => !item.available || item.quantity > item.stock
    );

    const formatPrice = (price) =>
        `₹${Number(price).toLocaleString("en-IN")}`;

    return (
        <div className="lavender-commerce min-h-screen bg-[#faf9ff] text-[#241b3b]">
            <header className="sticky top-0 z-40 border-b border-[#ece6fa] bg-white/95 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
                    <Link to="/user" className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-lg font-extrabold text-white">
                            H
                        </span>
                        <span className="text-xl font-extrabold tracking-tight text-[#33215f] sm:text-2xl">
                            HealCart
                        </span>
                    </Link>

                    <div className="flex items-center gap-2 rounded-full border border-[#e8e0fa] bg-[#f8f5ff] px-3 py-2 text-sm font-semibold text-violet-800 sm:px-4">
                        <ShieldCheck size={18} />
                        <span>Secure shopping</span>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                    <Link
                        to="/user"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-[#71638f] transition hover:text-violet-700"
                    >
                        <ArrowLeft size={18} />
                        Continue shopping
                    </Link>

                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-[#71638f] ring-1 ring-[#ece6fa]">
                        <ShoppingBag size={17} className="text-violet-600" />
                        {totalItems} {totalItems === 1 ? "item" : "items"} in your cart
                    </div>
                </div>

                <section className="mb-8">
                    <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-violet-600">
                        Your selection
                    </p>
                    <h1 className="text-3xl font-extrabold tracking-tight text-[#241b3b] sm:text-4xl">
                        Shopping cart
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#716985] sm:text-base">
                        Review your items, update quantities, and get your
                        order ready for checkout.
                    </p>
                </section>

                {stockNotice && (
                    <div
                        role="alert"
                        className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                    >
                        <AlertCircle
                            size={20}
                            className="mt-0.5 shrink-0 text-amber-700"
                        />
                        <p className="flex-1 leading-6">{stockNotice}</p>
                        <button
                            type="button"
                            onClick={() => setStockNotice("")}
                            aria-label="Dismiss stock notice"
                            className="rounded-lg px-2 py-1 text-amber-800 hover:bg-amber-100"
                        >
                            ×
                        </button>
                    </div>
                )}

                {loading ? (
                    <section
                        aria-live="polite"
                        className="rounded-2xl border border-[#ece6fa] bg-white px-6 py-16 text-center"
                    >
                        <RefreshCw
                            size={30}
                            className="mx-auto animate-spin text-violet-600"
                        />
                        <h2 className="mt-5 text-lg font-bold">
                            Updating your cart
                        </h2>
                        <p className="mt-2 text-sm text-[#716985]">
                            Checking the latest product and stock information.
                        </p>
                    </section>
                ) : error ? (
                    <section
                        role="alert"
                        className="rounded-2xl border border-red-200 bg-white p-6 sm:p-8"
                    >
                        <div className="flex items-start gap-4">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
                                <AlertCircle size={23} />
                            </span>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold">
                                    We couldn't refresh your cart
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-[#716985]">
                                    {error}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => window.location.reload()}
                                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-700"
                                >
                                    <RefreshCw size={17} />
                                    Try again
                                </button>
                            </div>
                        </div>
                    </section>
                ) : cartItems.length === 0 ? (
                    <section className="rounded-2xl border border-[#ece6fa] bg-white px-6 py-16 text-center sm:px-10">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f1ebff] text-violet-700">
                            <ShoppingBag size={36} />
                        </div>

                        <h2 className="mt-6 text-2xl font-extrabold">
                            Your cart is empty
                        </h2>

                        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#716985] sm:text-base">
                            Find something you'll love. Explore our collection
                            and discover your next favourite piece of tech.
                        </p>

                        <Link
                            to="/user"
                            className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-violet-700"
                        >
                            Explore products
                            <ArrowRight size={18} />
                        </Link>
                    </section>
                ) : (
                    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <section className="min-w-0 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ece6fa] bg-white px-4 py-4 sm:px-5">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ebff] text-violet-700">
                                        <ShieldCheck size={21} />
                                    </span>
                                    <div>
                                        <p className="text-sm font-bold text-[#33215f]">
                                            Self-healing checkout
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-[#716985] sm:text-sm">
                                            Stock is checked again when you order.
                                        </p>
                                    </div>
                                </div>

                                <span className="rounded-full bg-[#f5f0ff] px-3 py-1.5 text-xs font-bold text-violet-800">
                                    {totalItems} {totalItems === 1 ? "item" : "items"}
                                </span>
                            </div>

                            {unavailableItems.length > 0 && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                                >
                                    <AlertCircle
                                        size={20}
                                        className="mt-0.5 shrink-0"
                                    />
                                    <div>
                                        <p className="font-bold">
                                            Some items need your attention
                                        </p>
                                        <p className="mt-1 leading-6">
                                            Remove unavailable products or reduce
                                            quantities to match current stock before
                                            checkout.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {cartItems.map((item) => {
                                const stockExceeded =
                                    item.available && item.quantity > item.stock;

                                return (
                                    <article
                                        key={item.productId}
                                        className={`rounded-2xl border bg-white p-4 transition-colors sm:p-5 ${
                                            !item.available || stockExceeded
                                                ? "border-red-200"
                                                : "border-[#ece6fa] hover:border-[#d9cdf8]"
                                        }`}
                                    >
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                            <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f8f6ff] sm:h-32 sm:w-32">
                                                {item.image ? (
                                                    <img
                                                        src={item.image}
                                                        alt={item.name}
                                                        className="h-full w-full object-contain p-3"
                                                    />
                                                ) : (
                                                    <Package
                                                        size={38}
                                                        className="text-violet-300"
                                                    />
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <h2 className="break-words text-base font-bold leading-6 text-[#30234f] sm:text-lg">
                                                    {item.name}
                                                </h2>

                                                <p className="mt-2 text-lg font-extrabold text-violet-700">
                                                    {formatPrice(item.price)}
                                                    <span className="ml-1 text-xs font-medium text-[#817794]">
                                                        / unit
                                                    </span>
                                                </p>

                                                {!item.available ? (
                                                    <p className="mt-3 flex items-start gap-2 text-sm font-semibold leading-5 text-red-700">
                                                        <AlertCircle
                                                            size={17}
                                                            className="mt-0.5 shrink-0"
                                                        />
                                                        Product unavailable. Remove it
                                                        to continue.
                                                    </p>
                                                ) : stockExceeded ? (
                                                    <p className="mt-3 flex items-start gap-2 text-sm font-semibold leading-5 text-red-700">
                                                        <AlertCircle
                                                            size={17}
                                                            className="mt-0.5 shrink-0"
                                                        />
                                                        Only {item.stock} available.
                                                        Reduce the quantity.
                                                    </p>
                                                ) : item.stock === 0 ? (
                                                    <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-red-700">
                                                        <AlertCircle size={17} />
                                                        Currently out of stock
                                                    </p>
                                                ) : (
                                                    <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
                                                        <CheckCircle2
                                                            size={17}
                                                            className="shrink-0"
                                                        />
                                                        {item.stock} currently in stock
                                                    </p>
                                                )}

                                                <div className="mt-4 flex flex-wrap items-center gap-3">
                                                    <div
                                                        className="flex items-center gap-1 rounded-xl border border-[#e8e0fa] bg-[#faf9ff] p-1"
                                                        aria-label={`Quantity for ${item.name}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                updateQuantity(
                                                                    item.productId,
                                                                    -1
                                                                )
                                                            }
                                                            disabled={
                                                                item.quantity <= 1 ||
                                                                !item.available
                                                            }
                                                            aria-label="Decrease quantity"
                                                            className="flex h-9 w-9 items-center justify-center rounded-lg text-violet-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            <Minus size={17} />
                                                        </button>

                                                        <span className="min-w-8 text-center text-sm font-bold">
                                                            {item.quantity}
                                                        </span>

                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                updateQuantity(
                                                                    item.productId,
                                                                    1
                                                                )
                                                            }
                                                            disabled={
                                                                !item.available ||
                                                                item.quantity >= item.stock
                                                            }
                                                            aria-label="Increase quantity"
                                                            className="flex h-9 w-9 items-center justify-center rounded-lg text-violet-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            <Plus size={17} />
                                                        </button>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            removeItem(item.productId)
                                                        }
                                                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[#82748e] transition hover:bg-red-50 hover:text-red-600"
                                                    >
                                                        <Trash2 size={16} />
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between border-t border-[#f0ebfa] pt-3 sm:min-w-28 sm:flex-col sm:items-end sm:justify-center sm:border-0 sm:pt-0">
                                                <p className="text-xs text-[#817794]">
                                                    Item total
                                                </p>
                                                <p className="text-lg font-extrabold text-[#30234f]">
                                                    {formatPrice(
                                                        item.price * item.quantity
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}

                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                <Link
                                    to="/user"
                                    className="inline-flex items-center gap-2 py-2 text-sm font-semibold text-violet-700 transition hover:text-violet-900"
                                >
                                    <ArrowLeft size={17} />
                                    Add more products
                                </Link>

                                <button
                                    type="button"
                                    onClick={clearCart}
                                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                                >
                                    <Trash2 size={16} />
                                    Clear cart
                                </button>
                            </div>
                        </section>

                        <aside className="lg:sticky lg:top-24">
                            <div className="overflow-hidden rounded-2xl border border-[#e8e0fa] bg-white">
                                <div className="border-b border-[#ece6fa] px-5 py-5">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ebff] text-violet-700">
                                            <ShoppingBag size={20} />
                                        </span>
                                        <div>
                                            <h2 className="text-lg font-extrabold text-[#30234f]">
                                                Order summary
                                            </h2>
                                            <p className="mt-1 text-xs text-[#817794]">
                                                A summary of your selection
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5 p-5">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                        <span className="text-[#716985]">
                                            Items ({totalItems})
                                        </span>
                                        <span className="font-semibold text-[#30234f]">
                                            {formatPrice(subtotal)}
                                        </span>
                                    </div>

                                    <div className="flex items-start justify-between gap-3 text-sm">
                                        <span className="text-[#716985]">
                                            Shipping
                                        </span>
                                        <span className="text-right font-medium text-[#30234f]">
                                            Calculated at checkout
                                        </span>
                                    </div>

                                    <div className="border-t border-dashed border-[#e5dcf8] pt-5">
                                        <div className="flex items-end justify-between gap-3">
                                            <div>
                                                <p className="text-base font-bold text-[#30234f]">
                                                    Subtotal
                                                </p>
                                                <p className="mt-1 text-xs text-[#817794]">
                                                    Before applicable fees
                                                </p>
                                            </div>
                                            <p className="text-2xl font-extrabold tracking-tight text-violet-700">
                                                {formatPrice(subtotal)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3 rounded-xl bg-[#f8f5ff] p-3.5">
                                        <ShieldCheck
                                            size={20}
                                            className="mt-0.5 shrink-0 text-violet-700"
                                        />
                                        <p className="text-xs leading-5 text-[#625779]">
                                            Stock is validated again when you
                                            place your order. Adding items to
                                            your cart does not reserve stock.
                                        </p>
                                    </div>

                                    {unavailableItems.length > 0 && (
                                        <p className="text-sm font-semibold leading-5 text-red-700">
                                            Resolve the stock warnings before
                                            proceeding to checkout.
                                        </p>
                                    )}

                                    <Link
                                        to="/user/checkout"
                                        aria-disabled={unavailableItems.length > 0}
                                        onClick={(event) => {
                                            if (unavailableItems.length > 0) {
                                                event.preventDefault();
                                                setStockNotice(
                                                    "Please remove unavailable items or reduce quantities to the available stock before checkout."
                                                );
                                            }
                                        }}
                                        className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-bold text-white transition ${
                                            unavailableItems.length > 0
                                                ? "cursor-not-allowed bg-violet-300"
                                                : "bg-violet-600 hover:bg-violet-700"
                                        }`}
                                    >
                                        Proceed to checkout
                                        <ArrowRight size={18} />
                                    </Link>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col items-center gap-2 rounded-xl border border-[#eee8fa] px-2 py-3 text-center">
                                            <ShieldCheck
                                                size={20}
                                                className="text-violet-700"
                                            />
                                            <span className="text-xs font-semibold text-[#625779]">
                                                Secure checkout
                                            </span>
                                        </div>

                                        <div className="flex flex-col items-center gap-2 rounded-xl border border-[#eee8fa] px-2 py-3 text-center">
                                            <RefreshCw
                                                size={20}
                                                className="text-violet-700"
                                            />
                                            <span className="text-xs font-semibold text-[#625779]">
                                                Recovery support
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <p className="mt-4 text-center text-xs leading-5 text-[#817794]">
                                You can change quantities or remove products
                                before checkout.
                            </p>
                        </aside>
                    </div>
                )}
            </main>

            <footer className="mt-8 border-t border-[#ece6fa] bg-white">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-5 text-center sm:flex-row sm:px-8 sm:text-left">
                    <Link
                        to="/user"
                        className="text-lg font-extrabold tracking-tight text-[#33215f]"
                    >
                        HealCart
                    </Link>

                    <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[#817794] sm:text-sm">
                        <ShieldCheck size={17} className="text-violet-700" />
                        <span>
                            Resilient shopping, backed by self-healing recovery.
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
