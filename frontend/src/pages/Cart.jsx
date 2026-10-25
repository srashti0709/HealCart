
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
        <div className="lavender-commerce min-h-screen bg-[#f7f5ff] text-[#211a3b]">
            <header className="sticky top-0 z-40 border-b border-violet-100 bg-white/95 shadow-[0_2px_12px_rgba(48,35,91,0.04)] backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 lg:px-8">
                    <Link
                        to="/user"
                        className="flex shrink-0 items-center gap-3"
                    >
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-lg font-extrabold text-white shadow-md shadow-violet-200">
                            S
                        </span>
                        <span className="text-2xl font-extrabold tracking-tight text-violet-800">
                            HealCart
                        </span>
                    </Link>

                    <div className="flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-4 py-2.5 text-base font-semibold text-violet-800">
                        <ShieldCheck size={19} />
                        <span className="hidden sm:inline">
                            Secure shopping
                        </span>
                        <span className="sm:hidden">Secure</span>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-5 py-8 sm:py-10 lg:px-8">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                    <Link
                        to="/user"
                        className="inline-flex items-center gap-2 rounded-lg text-base font-semibold text-violet-700 transition hover:text-violet-900"
                    >
                        <ArrowLeft size={19} />
                        Continue shopping
                    </Link>

                    <div className="flex items-center gap-2 text-base text-violet-700">
                        <ShoppingBag size={19} />
                        <span>
                            {totalItems} {totalItems === 1 ? "item" : "items"} in your cart
                        </span>
                    </div>
                </div>

                <section className="mb-8">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white px-4 py-2 text-base font-semibold text-violet-700 shadow-sm">
                        <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                        Your selection
                    </div>

                    <h1 className="text-3xl font-extrabold tracking-tight text-[#211a3b] sm:text-4xl">
                        Your shopping cart
                    </h1>

                    <p className="mt-3 max-w-2xl text-base leading-7 text-[#625b79] sm:text-lg">
                        Review your products, confirm quantities, and get
                        everything ready for checkout.
                    </p>
                </section>

                {stockNotice && (
                    <div
                        role="alert"
                        className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-base text-amber-950"
                    >
                        <AlertCircle
                            size={22}
                            className="mt-0.5 shrink-0 text-amber-700"
                        />
                        <p className="flex-1 leading-6">{stockNotice}</p>
                        <button
                            type="button"
                            onClick={() => setStockNotice("")}
                            aria-label="Dismiss stock notice"
                            className="rounded-lg p-1 text-amber-800 hover:bg-amber-100"
                        >
                            ×
                        </button>
                    </div>
                )}

                {loading ? (
                    <section
                        aria-live="polite"
                        className="rounded-3xl border border-violet-100 bg-white p-10 shadow-sm sm:p-14"
                    >
                        <div className="flex flex-col items-center justify-center text-center">
                            <RefreshCw
                                size={34}
                                className="animate-spin text-violet-600"
                            />
                            <h2 className="mt-5 text-xl font-bold text-[#211a3b]">
                                Updating your cart
                            </h2>
                            <p className="mt-2 text-base text-[#625b79]">
                                Checking the latest product and stock information.
                            </p>
                        </div>
                    </section>
                ) : error ? (
                    <section
                        role="alert"
                        className="rounded-3xl border border-red-200 bg-white p-7 shadow-sm sm:p-9"
                    >
                        <div className="flex items-start gap-4">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-700">
                                <AlertCircle size={25} />
                            </span>
                            <div className="flex-1">
                                <h2 className="text-xl font-bold text-[#211a3b]">
                                    We couldn't refresh your cart
                                </h2>
                                <p className="mt-2 text-base leading-7 text-[#625b79]">
                                    {error}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => window.location.reload()}
                                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-base font-bold text-white transition hover:bg-violet-700"
                                >
                                    <RefreshCw size={18} />
                                    Try again
                                </button>
                            </div>
                        </div>
                    </section>
                ) : cartItems.length === 0 ? (
                    <section className="rounded-3xl border border-violet-100 bg-white px-6 py-16 text-center shadow-sm sm:px-10">
                        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                            <ShoppingBag size={43} />
                        </div>

                        <h2 className="mt-6 text-2xl font-extrabold text-[#211a3b]">
                            Your cart is empty
                        </h2>

                        <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-[#625b79] sm:text-lg">
                            Your next favourite piece of tech could be waiting
                            for you. Explore our products and find your match.
                        </p>

                        <Link
                            to="/user"
                            className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-violet-200 transition hover:bg-violet-700"
                        >
                            Explore products
                            <ArrowRight size={19} />
                        </Link>
                    </section>
                ) : (
                    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
                        <section className="min-w-0 space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-white px-5 py-4 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                                        <ShieldCheck size={22} />
                                    </span>
                                    <div>
                                        <p className="text-base font-bold text-[#211a3b]">
                                            Self-healing checkout
                                        </p>
                                        <p className="mt-1 text-base text-[#625b79]">
                                            Stock is checked again when you order.
                                        </p>
                                    </div>
                                </div>

                                <span className="rounded-full bg-violet-50 px-3 py-2 text-base font-semibold text-violet-800">
                                    {totalItems} {totalItems === 1 ? "item" : "items"}
                                </span>
                            </div>

                            {unavailableItems.length > 0 && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-base text-red-800"
                                >
                                    <AlertCircle
                                        size={23}
                                        className="mt-0.5 shrink-0"
                                    />
                                    <div>
                                        <p className="font-bold">
                                            Some items need your attention
                                        </p>
                                        <p className="mt-1 leading-6">
                                            Remove unavailable products or reduce
                                            quantities to match current stock before
                                            continuing to checkout.
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
                                        className={`group rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6 ${
                                            !item.available || stockExceeded
                                                ? "border-red-200"
                                                : "border-violet-100"
                                        }`}
                                    >
                                        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                                            <div className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-50 bg-[#f7f5ff] sm:h-32 sm:w-32">
                                                {item.image ? (
                                                    <img
                                                        src={item.image}
                                                        alt={item.name}
                                                        className="h-full w-full object-contain p-3 transition duration-300 group-hover:scale-105"
                                                    />
                                                ) : (
                                                    <Package
                                                        size={42}
                                                        className="text-violet-300"
                                                    />
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <p className="text-base font-semibold text-violet-700">
                                                    HealCart selection
                                                </p>

                                                <h2 className="mt-2 break-words text-lg font-bold leading-7 text-[#211a3b] sm:text-xl">
                                                    {item.name}
                                                </h2>

                                                <p className="mt-2 text-xl font-extrabold text-violet-700">
                                                    {formatPrice(item.price)}
                                                    <span className="ml-2 text-base font-medium text-[#625b79]">
                                                        / unit
                                                    </span>
                                                </p>

                                                {!item.available ? (
                                                    <p className="mt-3 flex items-start gap-2 text-base font-semibold leading-6 text-red-700">
                                                        <AlertCircle
                                                            size={19}
                                                            className="mt-0.5 shrink-0"
                                                        />
                                                        Product unavailable. Remove it
                                                        to continue.
                                                    </p>
                                                ) : stockExceeded ? (
                                                    <p className="mt-3 flex items-start gap-2 text-base font-semibold leading-6 text-red-700">
                                                        <AlertCircle
                                                            size={19}
                                                            className="mt-0.5 shrink-0"
                                                        />
                                                        Only {item.stock} available.
                                                        Reduce the quantity.
                                                    </p>
                                                ) : item.stock === 0 ? (
                                                    <p className="mt-3 flex items-center gap-2 text-base font-semibold text-red-700">
                                                        <AlertCircle size={19} />
                                                        Currently out of stock
                                                    </p>
                                                ) : (
                                                    <p className="mt-3 flex items-center gap-2 text-base text-[#625b79]">
                                                        <CheckCircle2
                                                            size={19}
                                                            className="shrink-0 text-emerald-600"
                                                        />
                                                        {item.stock} currently in stock
                                                    </p>
                                                )}

                                                <div className="mt-5 flex flex-wrap items-center gap-3">
                                                    <div
                                                        className="flex items-center gap-2 rounded-xl border border-violet-100 bg-[#f7f5ff] p-1"
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
                                                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-violet-800 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            <Minus size={18} />
                                                        </button>

                                                        <span className="min-w-10 text-center text-lg font-bold text-[#211a3b]">
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
                                                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-violet-800 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            <Plus size={18} />
                                                        </button>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            removeItem(item.productId)
                                                        }
                                                        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-base font-semibold text-red-600 transition hover:bg-red-50 hover:text-red-800"
                                                    >
                                                        <Trash2 size={19} />
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="border-t border-violet-100 pt-4 sm:min-w-32 sm:border-0 sm:pt-0 sm:text-right">
                                                <p className="text-base text-[#625b79]">
                                                    Item total
                                                </p>
                                                <p className="mt-1 text-xl font-extrabold text-[#211a3b]">
                                                    {formatPrice(
                                                        item.price * item.quantity
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}

                            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
                                <Link
                                    to="/user"
                                    className="inline-flex items-center gap-2 rounded-lg py-2 text-base font-semibold text-violet-700 transition hover:text-violet-900"
                                >
                                    <ArrowLeft size={19} />
                                    Add more products
                                </Link>

                                <button
                                    type="button"
                                    onClick={clearCart}
                                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-base font-semibold text-red-600 transition hover:bg-red-50"
                                >
                                    <Trash2 size={18} />
                                    Clear cart
                                </button>
                            </div>
                        </section>

                        <aside className="lg:sticky lg:top-28">
                            <div className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-[0_12px_40px_rgba(66,46,125,0.07)]">
                                <div className="border-b border-violet-100 bg-gradient-to-br from-violet-50 to-white p-6">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-md shadow-violet-200">
                                            <ShoppingBag size={23} />
                                        </span>
                                        <div>
                                            <h2 className="text-xl font-extrabold text-[#211a3b]">
                                                Order summary
                                            </h2>
                                            <p className="mt-1 text-base text-[#625b79]">
                                                Your cart at a glance
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5 p-6">
                                    <div className="flex items-center justify-between gap-3 text-base text-[#625b79]">
                                        <span>
                                            Items ({totalItems})
                                        </span>
                                        <span className="font-semibold text-[#211a3b]">
                                            {formatPrice(subtotal)}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 text-base text-[#625b79]">
                                        <span>Shipping</span>
                                        <span className="font-semibold text-[#211a3b]">
                                            Calculated at checkout
                                        </span>
                                    </div>

                                    <div className="border-t border-dashed border-violet-200 pt-5">
                                        <div className="flex items-end justify-between gap-3">
                                            <div>
                                                <p className="text-lg font-bold text-[#211a3b]">
                                                    Subtotal
                                                </p>
                                                <p className="mt-1 text-base text-[#625b79]">
                                                    Before any applicable fees
                                                </p>
                                            </div>
                                            <p className="text-2xl font-extrabold tracking-tight text-violet-700">
                                                {formatPrice(subtotal)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-[#f7f5ff] p-4">
                                        <ShieldCheck
                                            size={22}
                                            className="mt-0.5 shrink-0 text-violet-700"
                                        />
                                        <p className="text-base leading-6 text-[#51476e]">
                                            Stock is validated again when you
                                            place your order. Adding items to
                                            your cart does not reserve stock.
                                        </p>
                                    </div>

                                    {unavailableItems.length > 0 && (
                                        <p className="text-base font-semibold leading-6 text-red-700">
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
                                        className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-5 py-4 text-center text-base font-bold text-white shadow-md transition ${
                                            unavailableItems.length > 0
                                                ? "cursor-not-allowed bg-violet-300 shadow-none"
                                                : "bg-violet-600 shadow-violet-200 hover:bg-violet-700 hover:shadow-lg active:scale-[0.99]"
                                        }`}
                                    >
                                        Proceed to checkout
                                        <ArrowRight size={20} />
                                    </Link>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-violet-50 px-3 py-4 text-center">
                                            <ShieldCheck
                                                size={22}
                                                className="text-violet-700"
                                            />
                                            <span className="text-base font-semibold text-[#51476e]">
                                                Secure checkout
                                            </span>
                                        </div>

                                        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-violet-50 px-3 py-4 text-center">
                                            <RefreshCw
                                                size={22}
                                                className="text-violet-700"
                                            />
                                            <span className="text-base font-semibold text-[#51476e]">
                                                Recovery support
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <p className="mt-5 text-center text-base leading-6 text-[#625b79]">
                                Need to make a change? You can update quantities
                                or remove products before checkout.
                            </p>
                        </aside>
                    </div>
                )}
            </main>

            <footer className="mt-8 border-t border-violet-100 bg-white">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-6 text-center sm:flex-row sm:text-left lg:px-8">
                    <Link
                        to="/user"
                        className="text-xl font-extrabold text-violet-800"
                    >
                        HealCart
                    </Link>

                    <div className="flex flex-wrap items-center justify-center gap-2 text-base text-[#625b79]">
                        <ShieldCheck size={19} className="text-violet-700" />
                        <span>
                            Resilient shopping, backed by self-healing recovery.
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
