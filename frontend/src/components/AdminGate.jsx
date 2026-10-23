
import { useEffect, useState } from "react";
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
    return <div className="min-h-screen bg-slate-950 text-white grid place-items-center">Verifying admin access...</div>;
  }

  if (status === "authorized") {
    return children;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl"
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            SHCom Security
          </p>
          <h1 className="mt-3 text-3xl font-bold">Admin access</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to open the Self-Healing Command Center.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm text-slate-300">Username</span>
          <input
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-400"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-slate-300">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-400"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          Sign in securely
        </button>

        <a href="/user" className="block text-center text-sm text-slate-400 hover:text-white">
          Return to storefront
        </a>
      </form>
    </main>
  );
}
