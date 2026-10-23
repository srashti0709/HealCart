import axios from "axios";
import { API_ENDPOINTS } from "../config/api";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, CreditCard, LoaderCircle, RefreshCw } from "lucide-react";
import { clearCart } from "../lib/cart";
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
    const checkoutAttemptRef = useRef(null);
    const pollerRef = useRef(null);

    const handleChange = (event) => {
        const { name, value } = event.target;

        setCustomer((current) => ({
            ...current,
            [name]: value,
        }));
    };

    useEffect(() => {
        return () => {
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

            setError(backendMessage);
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
                <Link
                    to="/user/cart"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"
                >
                    <ArrowLeft size={17} />
                    Back to cart
                </Link>

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
            </main>
        </div>
    );
}
