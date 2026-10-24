
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  LockKeyhole,
  UserRound,
  ArrowRight,
  Store,
  Shield,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";

const TOKEN_KEY = "shcomAdminToken";

export default function AdminGate({ children }) {
  const [status, setStatus] = useState("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      const token = localStorage.getItem(TOKEN_KEY);

      if (!token) {
        if (!cancelled) setStatus("login");
        return;
      }

      try {
        await axios.get(`${API_BASE_URL}/api/auth/admin/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        axios.defaults.headers.common.Authorization = `Bearer ${token}`;
        setStatus("authorized");
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        delete axios.defaults.headers.common.Authorization;

        if (!cancelled) setStatus("login");
      }
    };

    verifySession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/auth/admin/login`,
        { username, password }
      );

      const token = response.data.token;

      localStorage.setItem(TOKEN_KEY, token);
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;

      setPassword("");
      setStatus("authorized");
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to sign in. Check the backend."
      );
    }
  };

  if (status === "checking") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f6fc] px-5 text-slate-900">
        <div className="w-full max-w-md rounded-3xl border border-violet-100 bg-white p-8 text-center shadow-xl shadow-violet-100/60">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-violet-100 text-violet-700">
            <LoaderCircle size={32} className="animate-spin" />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight">
            Verifying admin access
          </h1>

          <p className="mt-3 text-base leading-7 text-slate-600">
            Please wait while we securely verify your session.
          </p>

          <div className="mx-auto mt-6 h-1.5 max-w-48 overflow-hidden rounded-full bg-violet-100">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-violet-600" />
          </div>
        </div>
      </main>
    );
  }

  if (status === "authorized") {
    return children;
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f6fc] px-5 py-10 text-slate-900 sm:px-8">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-purple-200/50 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-2xl shadow-violet-200/50 lg:grid-cols-2">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-violet-700 via-violet-800 to-purple-950 p-10 text-white lg:flex xl:p-12">
          <div className="pointer-events-none absolute -right-24 -top-16 h-72 w-72 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-12 -top-4 h-48 w-48 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-purple-500/20 blur-2xl" />

          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-lg backdrop-blur-sm">
                <Store size={28} />
              </span>

              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  SHCom Admin
                </h2>
                <p className="mt-1 text-base text-violet-200">
                  Self-Healing Commerce
                </p>
              </div>
            </div>

            <div className="mt-20">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-base font-semibold text-violet-100">
                <ShieldCheck size={19} />
                Secure administrator access
              </span>

              <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
                Your store.
                <span className="mt-2 block text-violet-200">
                  Your command.
                </span>
              </h1>

              <p className="mt-5 max-w-md text-lg leading-8 text-violet-100">
                Access your store management tools through a secure
                administrator session.
              </p>
            </div>
          </div>

          <div className="relative mt-16 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-violet-100">
                <Shield size={25} />
              </span>

              <div>
                <h3 className="text-lg font-semibold">
                  Protected admin session
                </h3>
                <p className="mt-2 text-base leading-7 text-violet-200">
                  Your existing authentication and session verification
                  remain in place.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="p-6 sm:p-10 lg:p-12 xl:p-14">
          <div className="mx-auto max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg shadow-violet-200">
                <Store size={25} />
              </span>

              <div>
                <p className="text-xl font-bold tracking-tight text-slate-950">
                  SHCom Admin
                </p>
                <p className="mt-1 text-base text-slate-600">
                  Self-Healing Commerce
                </p>
              </div>
            </div>

            <div className="mb-8">
              <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-800">
                <LockKeyhole size={28} />
              </span>

              <p className="text-base font-semibold uppercase tracking-[0.16em] text-violet-800">
                Administrator portal
              </p>

              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Welcome back
              </h2>

              <p className="mt-3 text-base leading-7 text-slate-600">
                Sign in with your administrator credentials to continue.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <label className="block">
                <span className="mb-2 block text-base font-semibold text-slate-800">
                  Username
                </span>

                <span className="relative block">
                  <UserRound
                    size={21}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                  />

                  <input
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Enter your username"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-base text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-base font-semibold text-slate-800">
                  Password
                </span>

                <span className="relative block">
                  <LockKeyhole
                    size={21}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                  />

                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-base text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  />
                </span>
              </label>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-base leading-6 text-red-800"
                >
                  <AlertCircle size={22} className="mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <button
                type="submit"
                className="group flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-violet-700 to-purple-700 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:from-violet-800 hover:to-purple-800 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-violet-200"
              >
                <ShieldCheck size={21} />
                Sign in securely
                <ArrowRight
                  size={20}
                  className="transition-transform group-hover:translate-x-1"
                />
              </button>
            </form>

            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-base text-slate-500">
                Secure access
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <a
              href="/user"
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800"
            >
              <Store size={20} />
              Return to storefront
            </a>

            <p className="mt-7 text-center text-base leading-6 text-slate-500">
              Authorized administrators only.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
