import axios from "axios";
import { API_ENDPOINTS } from "../config/api";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, CreditCard, LoaderCircle, RefreshCw } from "lucide-react";
import { clearCart, writeCart } from "../lib/cart";
import { saveCheckoutDraft, readCheckoutDraft, deleteCheckoutDraft } from "../lib/offlineCheckoutDraft";
import {
    buildCartFingerprint,
    resolveCheckoutAttempt,
} from "../lib/checkoutAttempt";
import {
    createPaymentPoller,
    PAYMENT_ATTEMPT_STATE,
    PAYMENT_POLL_INTERVAL_MS,
    PAYMENT_POLL_MAX_DURATION_MS,
} from "../lib/paymentVerification";

export default function Checkout() {
    const [customer, setCustomer] = useState({
        name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        postalCode: "",
    });

    const [error, setError] = useState("");
    const [processing, setProcessing] = useState(false);
    const [orderResult, setOrderResult] = useState(null);
    const [recoveryResult, setRecoveryResult] = useState(null);
    const [verification, setVerification] = useState(null);
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [connectionLost, setConnectionLost] = useState(false);
    const [recoveryPrompt, setRecoveryPrompt] = useState(false);
    const [draftMessage, setDraftMessage] = useState("");
    const [draftMeta, setDraftMeta] = useState(null);
    const saveTimerRef = useRef(null);
    const customerRef = useRef(customer);
    const wasUnavailableRef = useRef(false);
    const initialConnectivityCheckRef = useRef(true);
    const checkoutAttemptRef = useRef(null);
    const pollerRef = useRef(null);

    const updateRecoveryEvidence = (patch) => {
        try {
            const current = JSON.parse(localStorage.getItem("shcomCheckoutRecoveryEvidence") || "{}");
            const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
            localStorage.setItem("shcomCheckoutRecoveryEvidence", JSON.stringify(next));
            return next;
        } catch {
            return null;
        }
    };

    const handleChange = (event) => {
        const { name, value } = event.target;

        const next = { ...customerRef.current, [name]: value };
        customerRef.current = next;
        setCustomer(next);
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                const cart = JSON.parse(localStorage.getItem("shcomCart") || "[]");
                await saveCheckoutDraft(next, cart);
                setDraftMeta(JSON.parse(localStorage.getItem("shcomCheckoutDraftMeta") || "null"));
            } catch {
                setDraftMessage("Could not save the offline draft on this device.");
            }
        }, 150);
    };

    useEffect(() => {
        let alive = true;
        const checkConnectivity = async () => {
            const forced = false;
            let reachable = false;
            if (!forced && navigator.onLine) {
                try {
                    const response = await fetch(API_ENDPOINTS.health, { cache: "no-store", signal: AbortSignal.timeout(1800) });
                    reachable = response.ok;
                } catch {}
            }
            if (!alive) return;
            const unavailable = forced || !navigator.onLine || !reachable;
            const isInitialCheck = initialConnectivityCheckRef.current;
            initialConnectivityCheckRef.current = false;
            setConnectionLost(unavailable);
            if (unavailable) {
                if (!wasUnavailableRef.current) {
                    updateRecoveryEvidence({
                        status: "failure-detected",
                        failureDetectedAt: new Date().toISOString(),
                        connectionRestoredAt: null,
                        restoredAt: null,
                    });
                    try {
                        const existingDraft = await readCheckoutDraft();
                        const currentCart = JSON.parse(localStorage.getItem("shcomCart") || "[]");
                        const hasCurrentProgress = Object.values(customerRef.current || {}).some(Boolean) || currentCart.length > 0;
                        const hasSavedProgress = existingDraft && (
                            Object.values(existingDraft.customer || {}).some(Boolean) ||
                            existingDraft.cart?.length
                        );

                        if (hasCurrentProgress) {
                            await saveCheckoutDraft(customerRef.current, currentCart);
                        } else if (!hasSavedProgress) {
                            await saveCheckoutDraft(customerRef.current, currentCart);
                        }

                        const emptyCustomer = { name: "", email: "", phone: "", address: "", city: "", postalCode: "" };
                        customerRef.current = emptyCustomer;
                        setCustomer(emptyCustomer);
                        setDraftMeta(JSON.parse(localStorage.getItem("shcomCheckoutDraftMeta") || "null"));
                        setDraftMessage("Your checkout details and cart are saved on this device. No order was submitted.");
                    } catch {
                        setDraftMessage("Connection interrupted. SHCom could not confirm that the checkout draft was saved.");
                    }
                }
                wasUnavailableRef.current = true;
            } else if (wasUnavailableRef.current || (isInitialCheck && ["failure-detected", "fault-triggered"].includes(
                (() => { try { return JSON.parse(localStorage.getItem("shcomCheckoutRecoveryEvidence") || "{}").status; } catch { return ""; } })()
            ))) {
                const wasUnavailable = wasUnavailableRef.current;
                wasUnavailableRef.current = false;
                if (wasUnavailable) {
                    updateRecoveryEvidence({
                        status: "connection-restored",
                        connectionRestoredAt: new Date().toISOString(),
                    });
                }
                try {
                    const draft = await readCheckoutDraft();
                    if (draft && (Object.values(draft.customer || {}).some(Boolean) || draft.cart?.length)) {
                        const emptyCustomer = { name: "", email: "", phone: "", address: "", city: "", postalCode: "" };
                        customerRef.current = emptyCustomer;
                        setCustomer(emptyCustomer);
                        setRecoveryPrompt(true);
                        setDraftMeta(JSON.parse(localStorage.getItem("shcomCheckoutDraftMeta") || "null"));
                        setDraftMessage("");
                    }
                } catch {}
            }
        };
        const onConnectivity = () => checkConnectivity();
        const onStorage = (event) => { if (event.key === "shcomCheckoutFault") checkConnectivity(); };
        checkConnectivity();
        const interval = setInterval(checkConnectivity, 2500);
        window.addEventListener("online", onConnectivity);
        window.addEventListener("offline", onConnectivity);
        window.addEventListener("storage", onStorage);
        return () => {
            alive = false;
            clearInterval(interval);
            clearTimeout(saveTimerRef.current);
            window.removeEventListener("online", onConnectivity);
            window.removeEventListener("offline", onConnectivity);
            window.removeEventListener("storage", onStorage);
            pollerRef.current?.stop();
        };
    }, []);

    /**
     * Reads the status of the existing payment attempt. It never submits a
     * checkout and never starts a payment.
     */
    const readAttemptStatus = async (attemptId, checkoutId) => {
        try {
            const response = await axios.get(
                API_ENDPOINTS.paymentAttemptStatus(attemptId),
                {
                    headers: { "x-checkout-id": checkoutId },
                    timeout: 5000,
                }
            );

            return { status: response.status, data: response.data };
        } catch (err) {
            return {
                status: err.response?.status || 0,
                data: err.response?.data || null,
            };
        }
    };

    const applyVerification = (result) => {
        setVerification(result);

        if (result.state === PAYMENT_ATTEMPT_STATE.PAID) {
            clearCart();
            deleteCheckoutDraft().catch(() => {});
            updateRecoveryEvidence({ status: "checkout-completed", completedAt: new Date().toISOString() });

            setOrderResult((current) => ({
                ...(current || {}),
                orderId: result.order?.id || current?.orderId || null,
                transactionId:
                    result.attempt?.transactionId || current?.transactionId,
                message:
                    "The payment was confirmed and your order is placed.",
                pending: false,
            }));

            setRecoveryResult({
                type: "payment_timeout_recovery",
                detected: true,
                status: "resolved",
                action: "Verified the existing payment transaction",
                result: "Payment confirmed; the order was finalized",
            });

            return;
        }

        if (result.state === PAYMENT_ATTEMPT_STATE.FAILED) {
            setOrderResult((current) => ({
                ...(current || {}),
                orderId: result.order?.id || current?.orderId || null,
                message:
                    "The payment was declined, so the order was cancelled and no stock was reserved.",
                pending: false,
                failed: true,
            }));
        }
    };

    /**
     * Starts watching an uncertain payment attempt.
     */
    const startVerification = (attemptId, checkoutId) => {
        pollerRef.current?.stop();

        const poller = createPaymentPoller({
            check: () => readAttemptStatus(attemptId, checkoutId),
            onUpdate: applyVerification,
        });

        pollerRef.current = poller;
        poller.start();
    };

    const checkPaymentStatus = async () => {
        if (!pollerRef.current) {
            return;
        }

        setCheckingStatus(true);

        try {
            await pollerRef.current.checkNow();
        } catch {
            // The poller already keeps the result inconclusive.
        } finally {
            setCheckingStatus(false);
        }
    };


    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setOrderResult(null);
        setRecoveryResult(null);

        if (processing) return;

        let cart;

        try {
            cart = JSON.parse(localStorage.getItem("shcomCart") || "[]");
        } catch {
            setError("Your cart data is invalid. Please return to your cart.");
            return;
        }

        if (!Array.isArray(cart) || cart.length === 0) {
            setError("Your cart is empty. Please add a product first.");
            return;
        }

        if (
            cart.some(
                (item) =>
                    !item.productId ||
                    !Number.isInteger(item.quantity) ||
                    item.quantity < 1
            )
        ) {
            setError("Your cart contains invalid items. Please review your cart.");
            return;
        }

        let backendReachable = false;
        if (navigator.onLine) {
            try {
                const healthResponse = await fetch(API_ENDPOINTS.health, {
                    cache: "no-store",
                    signal: AbortSignal.timeout(1800),
                });
                backendReachable = healthResponse.ok;
            } catch {}
        }

        if (!navigator.onLine || connectionLost || !backendReachable) {
            try {
                await saveCheckoutDraft(customer, cart);
                setDraftMeta(JSON.parse(localStorage.getItem("shcomCheckoutDraftMeta") || "null"));
            } catch {}
            setConnectionLost(true);
            setError("Connection interrupted. Your checkout progress is saved on this device. No order was submitted.");
            return;
        }

        setProcessing(true);

        try {
            const fingerprint = buildCartFingerprint(cart);
            const attempt = resolveCheckoutAttempt(
                checkoutAttemptRef.current,
                fingerprint
            );
            checkoutAttemptRef.current = attempt;
            const checkoutId = attempt.id;

            const response = await axios.post(API_ENDPOINTS.orders, {
                checkoutId,
                items: cart.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                })),
            });

            const backendData = response.data || {};
            const isPendingPayment =
                backendData.paymentStatus === "unknown" ||
                backendData.paymentStatus === "pending" ||
                /verify.*payment|Do not retry checkout|being verified|uncertain/i.test(
                    backendData.message || ""
                );

            if (backendData.success === false && isPendingPayment) {
                const attemptId =
                    backendData.orderId || backendData.order?._id || null;

                setOrderResult({
                    orderId: attemptId,
                    message: backendData.message || "Payment is being verified. Do not retry checkout or pay again yet.",
                    pending: true,
                });
                setError("");

                if (attemptId) {
                    startVerification(attemptId, checkoutId);
                }

                return;
            }

            if (!backendData.success || !backendData.order?._id) {
                throw new Error("The server did not confirm your order.");
            }

            clearCart();
            deleteCheckoutDraft().catch(() => {});
            updateRecoveryEvidence({ status: "checkout-completed", completedAt: new Date().toISOString() });

            setRecoveryResult(backendData.recovery || null);

            setOrderResult({
                orderId: backendData.order._id,
                transactionId: backendData.payment?.transactionId,
                message: backendData.message,
                pending: false,
            });
        } catch (err) {
            const backendMessage =
                err.response?.data?.message ||
                err.message ||
                "Checkout failed. Please check your order status before retrying.";

            const paymentIsUnknown =
                err.response?.data?.paymentStatus === "unknown" ||
                /verify.*payment|Do not retry checkout|being verified|uncertain/i.test(
                    backendMessage
                );

            if (paymentIsUnknown) {
                const attemptId = err.response?.data?.orderId || null;

                setOrderResult({
                    orderId: attemptId,
                    message: backendMessage,
                    pending: true,
                });
                setError("");

                if (attemptId && checkoutAttemptRef.current?.id) {
                    startVerification(attemptId, checkoutAttemptRef.current.id);
                }

                return;
            }

            if (!err.response || err.code === "ERR_NETWORK" || err.code === "ECONNABORTED") {
                try {
                    await saveCheckoutDraft(customer, cart);
                    setDraftMeta(JSON.parse(localStorage.getItem("shcomCheckoutDraftMeta") || "null"));
                } catch {}
                setConnectionLost(true);
                setError("Connection interrupted. Your checkout progress is saved on this device. No order was confirmed.");
            } else {
                setError(backendMessage);
            }
        } finally {
            setProcessing(false);
        }
    };


    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto max-w-3xl px-5 py-5">
                    <Link to="/user" className="text-xl font-bold text-emerald-900">
                        SHCom
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-5 py-10">
                {connectionLost ? (
                    <section role="status" className="flex min-h-[65vh] flex-col items-center justify-center text-center">
                        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                            <RefreshCw size={36} />
                        </div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">SHCom offline mode</p>
                        <h1 className="mt-3 text-3xl font-bold text-slate-900">This site is temporarily offline</h1>
                        <p className="mt-3 max-w-lg text-slate-600">Your checkout details and cart have been saved on this device. Reconnect to the internet to recover your checkout. No order or payment has been submitted.</p>
                        <p className="mt-4 text-sm text-slate-500">We are checking for your connection automatically.</p>
                    </section>
                ) : <>
                <Link
                    to="/user/cart"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"
                >
                    <ArrowLeft size={17} />
                    Back to cart
                </Link>

                {connectionLost && (
                    <div role="status" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                        <strong>Connection interrupted.</strong> Your checkout progress is saved on this device. You can keep filling in this form; orders are not submitted while disconnected.
                        {draftMeta && <p className="mt-1 text-xs">Saved fields: {draftMeta.fields || 0} · Cart lines: {draftMeta.items || 0}</p>}
                    </div>
                )}
                {draftMessage && <p className="mt-2 text-sm text-emerald-800">{draftMessage}</p>}
                {recoveryPrompt && (
                    <div role="dialog" aria-modal="true" className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
                        <h2 className="font-bold">Connection restored</h2>
                        <p className="mt-1 text-sm">Would you like to recover your saved checkout data or discard it?</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                            <button type="button" className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white" onClick={async () => {
                                try {
                                    const draft = await readCheckoutDraft();
                                    if (!draft) { setDraftMessage("No saved checkout draft was found."); setRecoveryPrompt(false); return; }
                                    const restoredCustomer = draft.customer || { name: "", email: "", phone: "", address: "", city: "", postalCode: "" };
                                    customerRef.current = restoredCustomer;
                                    setCustomer(restoredCustomer);
                                    if (Array.isArray(draft.cart)) writeCart(draft.cart);
                                    updateRecoveryEvidence({
                                        status: "data-restored",
                                        restoredAt: new Date().toISOString(),
                                        fieldsRestored: Object.values(draft.customer || {}).filter(Boolean).length,
                                        cartLinesRestored: Array.isArray(draft.cart) ? draft.cart.length : 0,
                                    });
                                    setConnectionLost(false);
                                    setDraftMeta(JSON.parse(localStorage.getItem("shcomCheckoutDraftMeta") || "null"));
                                    setRecoveryPrompt(false);
                                    setDraftMessage("Saved checkout data recovered. Review your details and submit checkout when ready.");
                                } catch { setDraftMessage("Could not recover the saved checkout draft."); }
                            }}>Recover Data</button>
                            <button type="button" className="rounded-lg border border-emerald-800 px-4 py-2 font-semibold" onClick={async () => {
                                if (!window.confirm("Discard the saved checkout draft? Confirmed orders will not be affected.")) return;
                                try {
                                    await deleteCheckoutDraft();
                                    const emptyCustomer = { name: "", email: "", phone: "", address: "", city: "", postalCode: "" };
                                    customerRef.current = emptyCustomer;
                                    setCustomer(emptyCustomer);
                                    updateRecoveryEvidence({ status: "draft-discarded", discardedAt: new Date().toISOString() });
                                    setDraftMeta(null);
                                    setRecoveryPrompt(false);
                                    setDraftMessage("Saved checkout details discarded. Your cart remains available so you can start checkout again.");
                                }
                                catch { setDraftMessage("Could not discard the saved checkout draft."); }
                            }}>Discard Data</button>
                        </div>
                    </div>
                )}
                <div className="mt-7">
                    <h1 className="text-3xl font-bold text-slate-900">
                        Checkout
                    </h1>
                    <p className="mt-2 text-slate-500">
                        Enter your delivery details to continue.
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
                >
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-emerald-50 p-3 text-emerald-800">
                            <ShieldCheck size={22} />
                        </div>
                        <div>
                            <h2 className="font-bold">Delivery information</h2>
                            <p className="text-sm text-slate-500">
                                All fields are required.
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium" htmlFor="name">
                            Full name
                        </label>
                        <input
                            id="name"
                            name="name"
                            value={customer.name}
                            onChange={handleChange}
                            required
                            autoComplete="name"
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                            placeholder="Enter your full name"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium" htmlFor="email">
                            Email address
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            value={customer.email}
                            onChange={handleChange}
                            required
                            autoComplete="email"
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                            placeholder="you@example.com"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium" htmlFor="phone">
                            Phone number
                        </label>
                        <input
                            id="phone"
                            name="phone"
                            type="tel"
                            value={customer.phone}
                            onChange={handleChange}
                            required
                            autoComplete="tel"
                            inputMode="tel"
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                            placeholder="Enter your phone number"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium" htmlFor="address">
                            Delivery address
                        </label>
                        <textarea
                            id="address"
                            name="address"
                            value={customer.address}
                            onChange={handleChange}
                            required
                            autoComplete="street-address"
                            rows={3}
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                            placeholder="House number, street, area"
                        />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm font-medium" htmlFor="city">
                                City
                            </label>
                            <input
                                id="city"
                                name="city"
                                value={customer.city}
                                onChange={handleChange}
                                required
                                autoComplete="address-level2"
                                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                                placeholder="Enter city"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium" htmlFor="postalCode">
                                PIN code
                            </label>
                            <input
                                id="postalCode"
                                name="postalCode"
                                value={customer.postalCode}
                                onChange={handleChange}
                                required
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                autoComplete="postal-code"
                                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                                placeholder="6-digit PIN code"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                            {error}
                        </p>
                    )}
                    {orderResult && (
                        <div
                            className={`rounded-xl border p-4 ${orderResult.pending
                                ? "border-amber-200 bg-amber-50 text-amber-900"
                                : orderResult.failed
                                    ? "border-red-200 bg-red-50 text-red-900"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                            }`}
                        >
                            <h3 className="font-bold">
                                {orderResult.pending
                                    ? "Payment verification in progress"
                                    : orderResult.failed
                                        ? "Payment could not be completed"
                                        : "Order placed successfully!"}
                            </h3>
                            <p className="mt-2 text-sm">{orderResult.message}</p>
                            {orderResult.orderId && (
                                <p className="mt-2 break-all text-sm">
                                    Order ID: {orderResult.orderId}
                                </p>
                            )}
                            {orderResult.transactionId && (
                                <p className="mt-1 break-all text-sm">
                                    Transaction ID: {orderResult.transactionId}
                                </p>
                            )}
                            {orderResult.pending && (
                                <div className="mt-3 flex items-center gap-2 text-xs">
                                    <LoaderCircle
                                        size={14}
                                        className="animate-spin"
                                    />
                                    <span>
                                        Checking this payment every{" "}
                                        {Math.round(
                                            PAYMENT_POLL_INTERVAL_MS / 1000
                                        )}{" "}
                                        seconds for up to{" "}
                                        {Math.round(
                                            PAYMENT_POLL_MAX_DURATION_MS / 1000
                                        )}{" "}
                                        seconds.
                                        {verification?.state ===
                                            PAYMENT_ATTEMPT_STATE.INCONCLUSIVE &&
                                        verification?.reason === "limit_reached"
                                            ? " The result is still unconfirmed, so please check again later."
                                            : verification?.state ===
                                                  PAYMENT_ATTEMPT_STATE.INCONCLUSIVE
                                                ? " The status could not be reached, so the result is still unconfirmed."
                                                : ""}
                                    </span>
                                </div>
                            )}
                            {orderResult.pending && (
                                <button
                                    type="button"
                                    onClick={checkPaymentStatus}
                                    disabled={checkingStatus || !orderResult.orderId}
                                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <RefreshCw
                                        size={15}
                                        className={
                                            checkingStatus ? "animate-spin" : ""
                                        }
                                    />
                                    {checkingStatus
                                        ? "Checking..."
                                        : "Check payment status"}
                                </button>
                            )}
                            {orderResult.pending ? (
                                <div className="mt-4 flex flex-wrap gap-3">
                                    <Link
                                        to="/user/orders"
                                        className="inline-flex font-semibold underline"
                                    >
                                        Check existing order
                                    </Link>
                                    <Link
                                        to="/user"
                                        className="inline-flex font-semibold underline"
                                    >
                                        Continue shopping
                                    </Link>
                                </div>
                            ) : (
                                <Link
                                    to="/user"
                                    className="mt-4 inline-flex font-semibold underline"
                                >
                                    Continue shopping
                                </Link>
                            )}
                        </div>
                    )}
                    {recoveryResult && (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-slate-900">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="text-amber-700" size={24} />
                                <h3 className="text-lg font-bold">
                                    Self-Healing Payment Recovery
                                </h3>
                            </div>

                            <p className="mt-2 text-sm text-amber-900">
                                A payment timeout was detected. SHCom verified the existing
                                transaction instead of attempting another payment.
                            </p>

                            <ol className="mt-4 space-y-3">
                                <li className="flex items-start gap-3">
                                    <span className="font-bold text-amber-700">1.</span>
                                    <div>
                                        <p className="font-semibold">Timeout detected</p>
                                        <p className="text-sm text-slate-600">
                                            The payment response was uncertain.
                                        </p>
                                    </div>
                                </li>

                                <li className="flex items-start gap-3">
                                    <span className="font-bold text-emerald-700">2.</span>
                                    <div>
                                        <p className="font-semibold">Transaction verified</p>
                                        <p className="text-sm text-slate-600">
                                            {recoveryResult.action}
                                        </p>
                                    </div>
                                </li>

                                <li className="flex items-start gap-3">
                                    <span className="font-bold text-emerald-700">3.</span>
                                    <div>
                                        <p className="font-semibold">Recovery completed</p>
                                        <p className="text-sm text-slate-600">
                                            {recoveryResult.result}
                                        </p>
                                    </div>
                                </li>
                            </ol>

                            <div className="mt-4 rounded-lg bg-emerald-100 p-3 font-semibold text-emerald-900">
                                Payment verified — order recovered successfully.
                            </div>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={processing || Boolean(orderResult)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-3.5 font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <CreditCard size={18} />
                        {processing
                            ? "Processing payment..."
                            : orderResult?.pending
                                ? "Check order status"
                                : "Place order & pay"}
                    </button>
                </form>
                </>}
            </main>
        </div>
    );
}
