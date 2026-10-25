
import axios from "axios";
import { API_ENDPOINTS } from "../config/api";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    ShieldCheck,
    CreditCard,
    LoaderCircle,
    RefreshCw,
    LockKeyhole,
    Wifi,
    WifiOff,
    CheckCircle2,
    AlertCircle,
    Cloud,
    Mail,
    Phone,
    MapPin,
    UserRound,
    PackageCheck,
    Trash2,
    Clock3,
} from "lucide-react";
import { clearCart, writeCart } from "../lib/cart";
import {
    saveCheckoutDraft,
    readCheckoutDraft,
    deleteCheckoutDraft,
} from "../lib/offlineCheckoutDraft";
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

const emptyCustomer = {
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
};

const inputClass =
    "w-full rounded-xl border border-[#ded8f2] bg-white px-4 py-3.5 text-base text-[#241b43] outline-none transition placeholder:text-[#89829e] focus:border-[#6851df] focus:ring-4 focus:ring-[#6851df]/10";

const labelClass =
    "mb-2 block text-base font-semibold text-[#352b52]";

function Field({ label, icon: Icon, children }) {
    return (
        <div className="min-w-0">
            <label className={labelClass} htmlFor={children.props.id}>
                <span className="flex items-center gap-2">
                    <Icon size={18} className="text-[#6851df]" />
                    {label}
                    <span className="text-[#b13b69]">*</span>
                </span>
            </label>
            {children}
        </div>
    );
}

function StatusPanel({ children, variant = "info" }) {
    const styles = {
        info: "border-[#d9d0fa] bg-[#f5f1ff] text-[#40316f]",
        success: "border-[#b7e4ce] bg-[#effbf4] text-[#17613f]",
        warning: "border-[#f2d7a0] bg-[#fff8e9] text-[#805316]",
        error: "border-[#f0c5d0] bg-[#fff1f4] text-[#922d4b]",
    };

    return (
        <div
            role="status"
            className={`rounded-2xl border p-5 ${styles[variant]}`}
        >
            {children}
        </div>
    );
}

export default function Checkout() {
    const [customer, setCustomer] = useState(emptyCustomer);
    const [error, setError] = useState("");
    const [processing, setProcessing] = useState(false);
    const [orderResult, setOrderResult] = useState(null);
    const [recoveryResult, setRecoveryResult] = useState(null);
    const [verification, setVerification] = useState(null);
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [isChaosTimeout, setIsChaosTimeout] = useState(false);
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
            const current = JSON.parse(
                localStorage.getItem("shcomCheckoutRecoveryEvidence") || "{}"
            );
            const next = {
                ...current,
                ...patch,
                updatedAt: new Date().toISOString(),
            };
            localStorage.setItem(
                "shcomCheckoutRecoveryEvidence",
                JSON.stringify(next)
            );
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
                const cart = JSON.parse(
                    localStorage.getItem("shcomCart") || "[]"
                );
                await saveCheckoutDraft(next, cart);
                setDraftMeta(
                    JSON.parse(
                        localStorage.getItem("shcomCheckoutDraftMeta") ||
                            "null"
                    )
                );
            } catch {
                setDraftMessage(
                    "Could not save the offline draft on this device."
                );
            }
        }, 150);
    };

    useEffect(() => {
        let alive = true;

        const checkConnectivity = async () => {
            let reachable = false;

            if (navigator.onLine) {
                try {
                    const response = await fetch(API_ENDPOINTS.health, {
                        cache: "no-store",
                        signal: AbortSignal.timeout(1800),
                    });
                    reachable = response.ok;
                } catch {}
            }

            if (!alive) return;

            const unavailable = !navigator.onLine || !reachable;
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
                        const currentCart = JSON.parse(
                            localStorage.getItem("shcomCart") || "[]"
                        );

                        const hasCurrentProgress =
                            Object.values(customerRef.current || {}).some(
                                Boolean
                            ) || currentCart.length > 0;

                        const hasSavedProgress =
                            existingDraft &&
                            (Object.values(
                                existingDraft.customer || {}
                            ).some(Boolean) || existingDraft.cart?.length);

                        if (hasCurrentProgress || !hasSavedProgress) {
                            await saveCheckoutDraft(
                                customerRef.current,
                                currentCart
                            );
                        }

                        customerRef.current = emptyCustomer;
                        setCustomer(emptyCustomer);
                        setDraftMeta(
                            JSON.parse(
                                localStorage.getItem(
                                    "shcomCheckoutDraftMeta"
                                ) || "null"
                            )
                        );
                        setDraftMessage(
                            "Your checkout details and cart are saved on this device. No order was submitted."
                        );
                    } catch {
                        setDraftMessage(
                            "Connection interrupted. SHCom could not confirm that the checkout draft was saved."
                        );
                    }
                }

                wasUnavailableRef.current = true;
            } else if (
                wasUnavailableRef.current ||
                (isInitialCheck &&
                    ["failure-detected", "fault-triggered"].includes(
                        (() => {
                            try {
                                return JSON.parse(
                                    localStorage.getItem(
                                        "shcomCheckoutRecoveryEvidence"
                                    ) || "{}"
                                ).status;
                            } catch {
                                return "";
                            }
                        })()
                    ))
            ) {
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

                    if (
                        draft &&
                        (Object.values(draft.customer || {}).some(Boolean) ||
                            draft.cart?.length)
                    ) {
                        customerRef.current = emptyCustomer;
                        setCustomer(emptyCustomer);
                        setRecoveryPrompt(true);
                        setDraftMeta(
                            JSON.parse(
                                localStorage.getItem(
                                    "shcomCheckoutDraftMeta"
                                ) || "null"
                            )
                        );
                        setDraftMessage("");
                    }
                } catch {}
            }
        };

        const onConnectivity = () => checkConnectivity();
        const onStorage = (event) => {
            if (event.key === "shcomCheckoutFault") checkConnectivity();
        };

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
            updateRecoveryEvidence({
                status: "checkout-completed",
                completedAt: new Date().toISOString(),
            });

            setOrderResult((current) => ({
                ...(current || {}),
                orderId:
                    result.order?.id ||
                    result.order?._id ||
                    current?.orderId ||
                    null,
                transactionId:
                    result.attempt?.transactionId ||
                    current?.transactionId,
                message: "Order placed successfully",
                pending: false,
                failed: false,
            }));

            // Only display recovery when explicitly confirmed by the backend.
            const confirmedRecovery =
                result.recovery?.type === "payment_timeout_recovery" &&
                result.recovery?.status === "resolved";

            setRecoveryResult(
                confirmedRecovery ? result.recovery : null
            );

            return;
        }

        if (result.state === PAYMENT_ATTEMPT_STATE.FAILED) {
            setRecoveryResult(null);

            setOrderResult((current) => ({
                ...(current || {}),
                orderId:
                    result.order?.id ||
                    result.order?._id ||
                    current?.orderId ||
                    null,
                message:
                    "The payment was declined, so the order was cancelled and no stock was reserved.",
                pending: false,
                failed: true,
            }));
        }
    };

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
        if (!pollerRef.current) return;

        setCheckingStatus(true);

        try {
            await pollerRef.current.checkNow();
        } catch {
            // Keep an inconclusive result inconclusive.
        } finally {
            setCheckingStatus(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setOrderResult(null);
        setRecoveryResult(null);
        setVerification(null);
        setIsChaosTimeout(false);

        if (processing) return;

        let cart;

        try {
            cart = JSON.parse(localStorage.getItem("shcomCart") || "[]");
        } catch {
            setError(
                "Your cart data is invalid. Please return to your cart."
            );
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
            setError(
                "Your cart contains invalid items. Please review your cart."
            );
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
                setDraftMeta(
                    JSON.parse(
                        localStorage.getItem("shcomCheckoutDraftMeta") ||
                            "null"
                    )
                );
            } catch {}

            setConnectionLost(true);
            setError(
                "Connection interrupted. Your checkout progress is saved on this device. No order was submitted."
            );
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
                    backendData.orderId ||
                    backendData.order?._id ||
                    null;

                const chaosTimeout =
                    backendData.simulatedTimeout === true;

                setIsChaosTimeout(chaosTimeout);
                setOrderResult({
                    orderId: attemptId,
                    message:
                        backendData.message ||
                        "Payment is being verified. Do not retry checkout or pay again yet.",
                    pending: true,
                });
                setRecoveryResult(null);
                setError("");

                if (attemptId) {
                    startVerification(attemptId, checkoutId);
                }

                return;
            }

            if (!backendData.success || !backendData.order?._id) {
                throw new Error(
                    "The server did not confirm your order."
                );
            }

            clearCart();
            deleteCheckoutDraft().catch(() => {});
            updateRecoveryEvidence({
                status: "checkout-completed",
                completedAt: new Date().toISOString(),
            });

            // A normal successful response must not invent a recovery timeline.
            const confirmedRecovery =
                backendData.recovery?.type === "payment_timeout_recovery" &&
                backendData.recovery?.status === "resolved";

            setRecoveryResult(
                confirmedRecovery ? backendData.recovery : null
            );

            setOrderResult({
                orderId: backendData.order._id,
                transactionId: backendData.payment?.transactionId,
                message: backendData.message || "Order placed successfully",
                pending: false,
                failed: false,
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

                setIsChaosTimeout(
                    err.response?.data?.simulatedTimeout === true
                );

                setOrderResult({
                    orderId: attemptId,
                    message: backendMessage,
                    pending: true,
                });
                setRecoveryResult(null);
                setError("");

                if (attemptId && checkoutAttemptRef.current?.id) {
                    startVerification(
                        attemptId,
                        checkoutAttemptRef.current.id
                    );
                }

                return;
            }

            if (
                !err.response ||
                err.code === "ERR_NETWORK" ||
                err.code === "ECONNABORTED"
            ) {
                try {
                    await saveCheckoutDraft(customer, cart);
                    setDraftMeta(
                        JSON.parse(
                            localStorage.getItem(
                                "shcomCheckoutDraftMeta"
                            ) || "null"
                        )
                    );
                } catch {}

                setConnectionLost(true);
                setError(
                    "Connection interrupted. Your checkout progress is saved on this device. No order was confirmed."
                );
            } else {
                setError(backendMessage);
            }
        } finally {
            setProcessing(false);
        }
    };

    const recoverDraft = async () => {
        try {
            const draft = await readCheckoutDraft();

            if (!draft) {
                setDraftMessage("No saved checkout draft was found.");
                setRecoveryPrompt(false);
                return;
            }

            const restoredCustomer = draft.customer || emptyCustomer;
            customerRef.current = restoredCustomer;
            setCustomer(restoredCustomer);

            if (Array.isArray(draft.cart)) {
                writeCart(draft.cart);
            }

            updateRecoveryEvidence({
                status: "data-restored",
                restoredAt: new Date().toISOString(),
                fieldsRestored: Object.values(
                    draft.customer || {}
                ).filter(Boolean).length,
                cartLinesRestored: Array.isArray(draft.cart)
                    ? draft.cart.length
                    : 0,
            });

            setConnectionLost(false);
            setDraftMeta(
                JSON.parse(
                    localStorage.getItem("shcomCheckoutDraftMeta") ||
                        "null"
                )
            );
            setRecoveryPrompt(false);
            setDraftMessage(
                "Saved checkout data recovered. Review your details and submit checkout when ready."
            );
        } catch {
            setDraftMessage("Could not recover the saved checkout draft.");
        }
    };

    const discardDraft = async () => {
        if (
            !window.confirm(
                "Discard the saved checkout draft? Confirmed orders will not be affected."
            )
        ) {
            return;
        }

        try {
            await deleteCheckoutDraft();
            customerRef.current = emptyCustomer;
            setCustomer(emptyCustomer);

            updateRecoveryEvidence({
                status: "draft-discarded",
                discardedAt: new Date().toISOString(),
            });

            setDraftMeta(null);
            setRecoveryPrompt(false);
            setDraftMessage(
                "Saved checkout details discarded. Your cart remains available so you can start checkout again."
            );
        } catch {
            setDraftMessage("Could not discard the saved checkout draft.");
        }
    };

    return (
        <div className="lavender-commerce min-h-screen bg-[#f7f4ff] text-[#241b43]">
            <header className="sticky top-0 z-40 border-b border-[#e9e2f8] bg-white/95 shadow-[0_2px_16px_rgba(51,35,91,0.04)] backdrop-blur-xl">
                <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
                    <Link to="/user" className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7663ef] to-[#4e36c7] text-white shadow-md shadow-violet-200">
                            <PackageCheck size={25} />
                        </span>
                        <span>
                            <span className="block text-xl font-extrabold tracking-tight text-[#35236c]">
                                SHCom
                            </span>
                            <span className="block text-base font-semibold text-[#756b91]">
                                Resilient commerce
                            </span>
                        </span>
                    </Link>

                    <div className="hidden items-center gap-2 rounded-full border border-[#e5def6] bg-[#f8f5ff] px-4 py-2.5 sm:flex">
                        <LockKeyhole size={19} className="text-[#6550d8]" />
                        <span className="text-base font-semibold text-[#493d70]">
                            Secure checkout
                        </span>
                    </div>

                    <Link
                        to="/user/orders"
                        className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-base font-semibold text-[#5c4aa7] transition hover:bg-[#f1ecff]"
                    >
                        My orders
                        <ArrowRight size={18} />
                    </Link>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-8 sm:py-10 lg:px-12">
                {connectionLost ? (
                    <section
                        role="status"
                        className="mx-auto flex min-h-[65vh] max-w-3xl flex-col items-center justify-center rounded-[32px] border border-[#e7dff8] bg-white px-6 py-12 text-center shadow-[0_18px_60px_rgba(70,49,130,0.08)] sm:px-12"
                    >
                        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[30px] bg-[#f0eaff] text-[#6550d8]">
                            <WifiOff size={43} />
                        </div>

                        <span className="mb-4 rounded-full bg-[#eee8ff] px-5 py-2 text-base font-bold uppercase tracking-wide text-[#5c45c4]">
                            SHCom offline mode
                        </span>

                        <h1 className="text-3xl font-extrabold tracking-tight text-[#2c204e] sm:text-4xl">
                            Your checkout is safe
                        </h1>

                        <p className="mt-4 max-w-xl text-base leading-7 text-[#716787] sm:text-lg">
                            We cannot currently reach the SHCom backend.
                            Your checkout progress and cart are saved on
                            this device where possible. No new order has
                            been submitted by this screen.
                        </p>

                        <div className="mt-8 w-full max-w-lg rounded-2xl border border-[#e6def7] bg-[#faf8ff] p-5 text-left">
                            <div className="flex items-start gap-4">
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#6550d8] shadow-sm">
                                    <Cloud size={25} />
                                </span>
                                <div>
                                    <h2 className="text-lg font-bold text-[#35275c]">
                                        Waiting for a connection
                                    </h2>
                                    <p className="mt-1 text-base leading-6 text-[#756b91]">
                                        SHCom checks the connection
                                        automatically. You can return to
                                        checkout once the backend is
                                        reachable.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {draftMessage && (
                            <p className="mt-5 text-base leading-6 text-[#5c4aa7]">
                                {draftMessage}
                            </p>
                        )}

                        {draftMeta && (
                            <p className="mt-3 text-base text-[#716787]">
                                Saved fields: {draftMeta.fields || 0}
                                {" · "}
                                Cart lines: {draftMeta.items || 0}
                            </p>
                        )}

                        <div className="mt-8 flex flex-wrap justify-center gap-3">
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        const response = await fetch(
                                            API_ENDPOINTS.health,
                                            {
                                                cache: "no-store",
                                                signal: AbortSignal.timeout(1800),
                                            }
                                        );

                                        if (response.ok) {
                                            setConnectionLost(false);
                                            setDraftMessage(
                                                "Connection restored. Checking for your saved checkout data."
                                            );
                                        } else {
                                            setDraftMessage(
                                                "The SHCom backend is still unavailable. We will keep checking automatically."
                                            );
                                        }
                                    } catch {
                                        setDraftMessage(
                                            "The SHCom backend is still unavailable. We will keep checking automatically."
                                        );
                                    }
                                }}
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#6048d8] px-6 py-3 text-base font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-[#4e37c3]"
                            >
                                <RefreshCw size={19} />
                                Check connection
                            </button>

                            <Link
                                to="/user/cart"
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#ded6f1] bg-white px-6 py-3 text-base font-bold text-[#55448c] transition hover:bg-[#f8f5ff]"
                            >
                                <ArrowLeft size={19} />
                                Back to cart
                            </Link>
                        </div>
                    </section>
                ) : (
                    <>
                        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                            <Link
                                to="/user/cart"
                                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-base font-semibold text-[#6550a8] transition hover:bg-white"
                            >
                                <ArrowLeft size={19} />
                                Back to cart
                            </Link>

                            <div className="inline-flex items-center gap-2 rounded-full border border-[#e3dcf6] bg-white px-4 py-2.5">
                                <ShieldCheck size={20} className="text-[#6048d8]" />
                                <span className="text-base font-semibold text-[#4e416f]">
                                    Protected checkout
                                </span>
                            </div>
                        </div>

                        <div className="mb-8">
                            <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#ece6ff] px-4 py-2 text-base font-bold text-[#5c45c4]">
                                <LockKeyhole size={18} />
                                SECURE CHECKOUT
                            </span>

                            <h1 className="text-4xl font-extrabold tracking-tight text-[#2c204e] sm:text-5xl">
                                Checkout
                            </h1>

                            <p className="mt-3 max-w-2xl text-base leading-7 text-[#716787] sm:text-lg">
                                Add your delivery details and review
                                everything before placing your order.
                            </p>
                        </div>

                        {draftMessage && (
                            <div className="mb-6 rounded-2xl border border-[#d9d0fa] bg-white p-4 text-base leading-6 text-[#514187]">
                                <div className="flex items-start gap-3">
                                    <Cloud size={22} className="mt-0.5 shrink-0 text-[#6550d8]" />
                                    <p>{draftMessage}</p>
                                </div>
                            </div>
                        )}

                        {recoveryPrompt && (
                            <StatusPanel variant="info">
                                <div className="flex items-start gap-4">
                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#6048d8] shadow-sm">
                                        <Wifi size={25} />
                                    </span>

                                    <div className="min-w-0 flex-1">
                                        <p className="text-base font-bold uppercase tracking-wide text-[#6048d8]">
                                            Session recovery
                                        </p>
                                        <h2 className="mt-1 text-xl font-bold text-[#35275c]">
                                            Connection restored
                                        </h2>
                                        <p className="mt-2 text-base leading-7">
                                            We found saved checkout data on
                                            this device. Recover it to
                                            continue where you left off, or
                                            discard the saved details.
                                        </p>

                                        {draftMeta && (
                                            <p className="mt-3 text-base">
                                                Saved fields: {draftMeta.fields || 0}
                                                {" · "}
                                                Cart lines: {draftMeta.items || 0}
                                            </p>
                                        )}

                                        <div className="mt-5 flex flex-wrap gap-3">
                                            <button
                                                type="button"
                                                onClick={recoverDraft}
                                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#6048d8] px-5 py-3 text-base font-bold text-white transition hover:bg-[#4e37c3]"
                                            >
                                                <RefreshCw size={18} />
                                                Recover data
                                            </button>

                                            <button
                                                type="button"
                                                onClick={discardDraft}
                                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d8d0ed] bg-white px-5 py-3 text-base font-semibold text-[#55476f] transition hover:bg-[#f8f5ff]"
                                            >
                                                <Trash2 size={18} />
                                                Discard saved data
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </StatusPanel>
                        )}

                        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
                            <form
                                onSubmit={handleSubmit}
                                className="min-w-0 rounded-[28px] border border-[#e7e0f6] bg-white p-5 shadow-[0_16px_50px_rgba(65,44,115,0.06)] sm:p-8 lg:p-9"
                            >
                                <div className="mb-8 flex items-start gap-4 border-b border-[#eee9f8] pb-7">
                                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#eee8ff] text-[#6048d8]">
                                        <MapPin size={27} />
                                    </span>
                                    <div>
                                        <h2 className="text-xl font-extrabold text-[#30234f] sm:text-2xl">
                                            Delivery information
                                        </h2>
                                        <p className="mt-2 text-base leading-6 text-[#756b91]">
                                            All fields are required. Make
                                            sure your address is correct.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <Field label="Full name" icon={UserRound}>
                                        <input
                                            id="name"
                                            name="name"
                                            value={customer.name}
                                            onChange={handleChange}
                                            required
                                            autoComplete="name"
                                            className={inputClass}
                                            placeholder="Enter your full name"
                                        />
                                    </Field>

                                    <Field label="Email address" icon={Mail}>
                                        <input
                                            id="email"
                                            name="email"
                                            type="email"
                                            value={customer.email}
                                            onChange={handleChange}
                                            required
                                            autoComplete="email"
                                            className={inputClass}
                                            placeholder="you@example.com"
                                        />
                                    </Field>

                                    <Field label="Phone number" icon={Phone}>
                                        <input
                                            id="phone"
                                            name="phone"
                                            type="tel"
                                            value={customer.phone}
                                            onChange={handleChange}
                                            required
                                            autoComplete="tel"
                                            inputMode="tel"
                                            className={inputClass}
                                            placeholder="Enter your phone number"
                                        />
                                    </Field>

                                    <Field label="Delivery address" icon={MapPin}>
                                        <textarea
                                            id="address"
                                            name="address"
                                            value={customer.address}
                                            onChange={handleChange}
                                            required
                                            autoComplete="street-address"
                                            rows={3}
                                            className={`${inputClass} resize-y`}
                                            placeholder="House number, street, area"
                                        />
                                    </Field>

                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <Field label="City" icon={MapPin}>
                                            <input
                                                id="city"
                                                name="city"
                                                value={customer.city}
                                                onChange={handleChange}
                                                required
                                                autoComplete="address-level2"
                                                className={inputClass}
                                                placeholder="Enter city"
                                            />
                                        </Field>

                                        <Field label="PIN code" icon={MapPin}>
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
                                                className={inputClass}
                                                placeholder="6-digit PIN code"
                                            />
                                        </Field>
                                    </div>
                                </div>

                                <div className="mt-7 flex items-start gap-3 rounded-2xl border border-[#e7e0f6] bg-[#faf8ff] p-4">
                                    <Cloud size={23} className="mt-0.5 shrink-0 text-[#6550d8]" />
                                    <div>
                                        <p className="text-base font-bold text-[#40316f]">
                                            Checkout draft protection
                                        </p>
                                        <p className="mt-1 text-base leading-6 text-[#756b91]">
                                            SHCom saves your form progress
                                            locally so you can recover it
                                            after an interruption.
                                        </p>
                                    </div>
                                </div>

                                {error && (
                                    <div className="mt-6">
                                        <StatusPanel variant={connectionLost ? "warning" : "error"}>
                                            <div className="flex items-start gap-3">
                                                <AlertCircle size={23} className="mt-0.5 shrink-0" />
                                                <p className="text-base leading-6">{error}</p>
                                            </div>
                                        </StatusPanel>
                                    </div>
                                )}

                                {orderResult && (
                                    <div
                                        className={`mt-6 rounded-2xl border p-5 ${
                                            orderResult.pending
                                                ? "border-[#f1d7a4] bg-[#fff9eb] text-[#785018]"
                                                : orderResult.failed
                                                  ? "border-[#f0c5d0] bg-[#fff1f4] text-[#922d4b]"
                                                  : "border-[#b7e4ce] bg-[#effbf4] text-[#17613f]"
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white">
                                                {orderResult.pending ? (
                                                    <Clock3 size={25} />
                                                ) : orderResult.failed ? (
                                                    <AlertCircle size={25} />
                                                ) : (
                                                    <CheckCircle2 size={25} />
                                                )}
                                            </span>

                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-xl font-extrabold">
                                                    {orderResult.pending
                                                        ? "Payment verification in progress"
                                                        : orderResult.failed
                                                          ? "Payment could not be completed"
                                                          : "Order placed successfully!"}
                                                </h3>

                                                <p className="mt-2 text-base leading-7">
                                                    {orderResult.message}
                                                </p>

                                                {orderResult.orderId && (
                                                    <p className="mt-3 break-all text-base">
                                                        <span className="font-bold">Order ID:</span>{" "}
                                                        {orderResult.orderId}
                                                    </p>
                                                )}

                                                {orderResult.transactionId && (
                                                    <p className="mt-2 break-all text-base">
                                                        <span className="font-bold">Transaction ID:</span>{" "}
                                                        {orderResult.transactionId}
                                                    </p>
                                                )}

                                                {orderResult.pending && (
                                                    <>
                                                        <div className="mt-4 flex items-start gap-3 rounded-xl bg-white/80 p-4 text-base leading-6">
                                                            <LoaderCircle size={21} className="mt-0.5 shrink-0 animate-spin" />
                                                            <span>
                                                                Checking this payment every{" "}
                                                                {Math.round(PAYMENT_POLL_INTERVAL_MS / 1000)} seconds for up to{" "}
                                                                {Math.round(PAYMENT_POLL_MAX_DURATION_MS / 1000)} seconds.
                                                                {verification?.state === PAYMENT_ATTEMPT_STATE.INCONCLUSIVE &&
                                                                verification?.reason === "limit_reached"
                                                                    ? " The result is still unconfirmed. Please check again later."
                                                                    : verification?.state === PAYMENT_ATTEMPT_STATE.INCONCLUSIVE
                                                                      ? " The status could not be reached, so the result remains unconfirmed."
                                                                      : ""}
                                                            </span>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={checkPaymentStatus}
                                                            disabled={checkingStatus || !orderResult.orderId}
                                                            className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#e4cf9f] bg-white px-4 py-3 text-base font-bold transition hover:bg-[#fff4d7] disabled:cursor-not-allowed disabled:opacity-60"
                                                        >
                                                            <RefreshCw size={19} className={checkingStatus ? "animate-spin" : ""} />
                                                            {checkingStatus ? "Checking..." : "Check payment status"}
                                                        </button>
                                                    </>
                                                )}

                                                <div className="mt-5 flex flex-wrap gap-4">
                                                    {orderResult.pending && (
                                                        <Link to="/user/orders" className="text-base font-bold underline underline-offset-4">
                                                            Check existing order
                                                        </Link>
                                                    )}
                                                    <Link to="/user" className="text-base font-bold underline underline-offset-4">
                                                        Continue shopping
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={processing || Boolean(orderResult)}
                                    className="mt-7 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#7059e8] to-[#5238ca] px-6 py-4 text-lg font-extrabold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:from-[#6048d8] hover:to-[#442bb9] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                                >
                                    {processing ? (
                                        <LoaderCircle size={22} className="animate-spin" />
                                    ) : (
                                        <CreditCard size={22} />
                                    )}
                                    {processing ? "Processing payment..." : "Place order & pay"}
                                </button>

                                <p className="mt-4 flex items-center justify-center gap-2 text-center text-base leading-6 text-[#756b91]">
                                    <ShieldCheck size={19} className="shrink-0 text-[#6048d8]" />
                                    Your order is submitted only after the checkout request reaches SHCom.
                                </p>
                            </form>

                            <aside className="space-y-5 lg:sticky lg:top-24">
                                <section className="rounded-[26px] border border-[#e7e0f6] bg-white p-6 shadow-[0_16px_50px_rgba(65,44,115,0.06)]">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eee8ff] text-[#6048d8]">
                                            <ShieldCheck size={25} />
                                        </span>
                                        <h2 className="text-xl font-extrabold text-[#30234f]">
                                            Checkout protection
                                        </h2>
                                    </div>

                                    <div className="mt-6 space-y-5">
                                        <div className="flex items-start gap-3">
                                            <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-[#6048d8]" />
                                            <div>
                                                <p className="text-base font-bold text-[#35275c]">Draft recovery</p>
                                                <p className="mt-1 text-base leading-6 text-[#756b91]">
                                                    Save and recover checkout details on this device.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3">
                                            <RefreshCw size={22} className="mt-0.5 shrink-0 text-[#6048d8]" />
                                            <div>
                                                <p className="text-base font-bold text-[#35275c]">Payment verification</p>
                                                <p className="mt-1 text-base leading-6 text-[#756b91]">
                                                    Check an existing uncertain payment instead of blindly submitting again.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3">
                                            <LockKeyhole size={22} className="mt-0.5 shrink-0 text-[#6048d8]" />
                                            <div>
                                                <p className="text-base font-bold text-[#35275c]">Checkout safeguards</p>
                                                <p className="mt-1 text-base leading-6 text-[#756b91]">
                                                    The checkout attempt identifier is reused according to your existing checkout logic.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className="rounded-[26px] border border-[#e7e0f6] bg-gradient-to-br from-[#eee8ff] via-[#f7f3ff] to-white p-6">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[#6048d8] shadow-sm">
                                        <Wifi size={25} />
                                    </span>
                                    <h2 className="mt-4 text-xl font-extrabold text-[#35275c]">
                                        Built for interruptions
                                    </h2>
                                    <p className="mt-2 text-base leading-7 text-[#655981]">
                                        If the connection drops, SHCom checks
                                        again automatically. When connectivity
                                        returns, you can choose whether to
                                        restore your saved checkout data.
                                    </p>
                                    <Link
                                        to="/user/cart"
                                        className="mt-5 inline-flex items-center gap-2 text-base font-bold text-[#5c45c4] transition hover:text-[#3f2aa8]"
                                    >
                                        Review your cart
                                        <ArrowRight size={19} />
                                    </Link>
                                </section>
                            </aside>
                        </div>
                    </>
                )}
            </main>

            <footer className="mt-8 border-t border-[#e7e0f6] bg-white">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-7 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eee8ff] text-[#6048d8]">
                            <ShieldCheck size={22} />
                        </span>
                        <div>
                            <p className="text-base font-bold text-[#35275c]">
                                SHCom Resilient Checkout
                            </p>
                            <p className="mt-1 text-base text-[#756b91]">
                                Designed to handle interruptions gracefully.
                            </p>
                        </div>
                    </div>
                    <p className="text-base text-[#756b91]">
                        Your order status is determined by the checkout service.
                    </p>
                </div>
            </footer>
        </div>
    );
}
