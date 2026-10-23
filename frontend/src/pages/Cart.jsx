
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
} from "lucide-react";
import { API_ENDPOINTS } from "../config/api";
import { readCart, writeCart } from "../lib/cart";

export default function Cart() {
    const [cart, setCart] = useState(() => readCart());

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await axios.get(API_ENDPOINTS.products);
                setProducts(response.data.products || []);
            } catch {
                setError("Unable to load current product and stock information.");
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
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
            alert(`Only ${item.stock} items are currently in stock.`);
            return;
        }

        setCart((currentCart) =>
            currentCart.map((item) =>
                item.productId === productId
                    ? { ...item, quantity: newQuantity }
                    : item
            )
        );
    };

    const removeItem = (productId) => {
        setCart((currentCart) =>
            currentCart.filter((item) => item.productId !== productId)
        );
    };

    const totalItems = cart.reduce(
        (total, item) => total + item.quantity,
        0
    );

    const subtotal = cartItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
    );

    const formatPrice = (price) =>
        `₹${price.toLocaleString("en-IN")}`;

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
                    <Link to="/user" className="text-xl font-bold text-emerald-900">
                        SHCom
                    </Link>

                    <span className="text-sm text-slate-500">
                        Shopping Cart · {totalItems} items
                    </span>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-5 py-10">
                <Link
                    to="/user"
                    className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950"
                >
                    <ArrowLeft size={17} />
                    Continue shopping
                </Link>

                <h1 className="text-3xl font-bold text-slate-900">
                    Your shopping cart
                </h1>

                <p className="mt-2 text-slate-500">
                    Review your items before checkout.
                </p>

                {loading ? (
                    <div className="mt-8 rounded-2xl border bg-white p-10 text-center text-slate-500">
                        Loading your cart...
                    </div>
                ) : error ? (
                    <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
                        {error}
                    </div>
                ) : cartItems.length === 0 ? (
                    <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
                        <ShoppingBag
                            size={42}
                            className="mx-auto text-emerald-700"
                        />
                        <h2 className="mt-4 text-xl font-bold">
                            Your cart is empty
                        </h2>
                        <p className="mt-2 text-slate-500">
                            Find something you love and add it to your cart.
                        </p>
                        <Link
                            to="/user"
                            className="mt-6 inline-flex rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-emerald-900"
                        >
                            Explore products
                        </Link>
                    </div>
                ) : (
                    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
                        <section className="space-y-4">
                            {cartItems.map((item) => (
                                <article
                                    key={item.productId}
                                    className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
                                >
                                    <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-xl bg-slate-100 sm:w-28">
                                        {item.image ? (
                                            <img
                                                src={item.image}
                                                alt={item.name}
                                                className="h-full w-full rounded-xl object-contain p-2"
                                            />
                                        ) : (
                                            <Package size={35} className="text-slate-400" />
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <h2 className="font-bold text-slate-900">
                                            {item.name}
                                        </h2>

                                        <p className="mt-1 text-lg font-semibold text-emerald-800">
                                            {formatPrice(item.price)}
                                        </p>

                                        {!item.available ? (
                                            <p className="mt-2 text-sm text-red-600">
                                                Product unavailable. Remove it to continue.
                                            </p>
                                        ) : item.stock < item.quantity ? (
                                            <p className="mt-2 text-sm text-red-600">
                                                Only {item.stock} available. Reduce quantity.
                                            </p>
                                        ) : (
                                            <p className="mt-2 text-xs text-slate-500">
                                                {item.stock} currently in stock
                                            </p>
                                        )}

                                        <div className="mt-3 flex items-center gap-3">
                                            <button
                                                onClick={() => updateQuantity(item.productId, -1)}
                                                disabled={item.quantity <= 1 || !item.available}
                                                aria-label="Decrease quantity"
                                                className="rounded-lg border p-2 hover:bg-slate-100 disabled:opacity-40"
                                            >
                                                <Minus size={15} />
                                            </button>

                                            <span className="min-w-5 text-center font-semibold">
                                                {item.quantity}
                                            </span>

                                            <button
                                                onClick={() => updateQuantity(item.productId, 1)}
                                                disabled={
                                                    !item.available ||
                                                    item.quantity >= item.stock
                                                }
                                                aria-label="Increase quantity"
                                                className="rounded-lg border p-2 hover:bg-slate-100 disabled:opacity-40"
                                            >
                                                <Plus size={15} />
                                            </button>

                                            <button
                                                onClick={() => removeItem(item.productId)}
                                                className="ml-auto inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
                                            >
                                                <Trash2 size={16} />
                                                Remove
                                            </button>
                                        </div>
                                    </div>

                                    <div className="text-left font-bold sm:text-right">
                                        {formatPrice(item.price * item.quantity)}
                                    </div>
                                </article>
                            ))}
                        </section>

                        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6">
                            <h2 className="text-lg font-bold">Order summary</h2>

                            <div className="mt-5 flex justify-between text-sm text-slate-600">
                                <span>Items ({totalItems})</span>
                                <span>{formatPrice(subtotal)}</span>
                            </div>

                            <div className="mt-4 flex justify-between border-t pt-4 text-lg font-bold">
                                <span>Subtotal</span>
                                <span>{formatPrice(subtotal)}</span>
                            </div>

                            <p className="mt-4 text-xs leading-5 text-slate-500">
                                Stock is validated again when you place your order.
                                Adding items to your cart does not reserve stock.
                            </p>

                            <Link
                                to="/user/checkout"
                                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white transition hover:bg-emerald-900"
                            >
                                Proceed to Checkout
                            </Link>
                        </aside>
                    </div>
                )}
            </main>
        </div>
    );
}
