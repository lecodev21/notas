"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Email o contraseña incorrectos");
    } else {
      router.push("/notes");
      router.refresh();
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center theme-transition"
      style={{ backgroundColor: "var(--app-bg-auth)" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--app-text-primary)" }}
          >
            ✏️ Inkdrop Clone
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
            Tu espacio para pensar
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-6 space-y-4 shadow-lg"
          style={{
            backgroundColor: "var(--app-bg-surface)",
            border: "1px solid var(--app-border)",
          }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--app-text-primary)" }}
          >
            Iniciar sesión
          </h2>

          {error && (
            <div className="text-sm text-red-500 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label
              htmlFor="email"
              className="text-xs font-medium"
              style={{ color: "var(--app-text-secondary)" }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="tu@email.com"
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition focus:ring-1 focus:ring-indigo-500"
              style={{
                backgroundColor: "var(--app-bg-input)",
                color: "var(--app-text-primary)",
                border: "1px solid var(--app-border-strong)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--app-border-strong)")}
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="text-xs font-medium"
              style={{ color: "var(--app-text-secondary)" }}
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition focus:ring-1 focus:ring-indigo-500"
              style={{
                backgroundColor: "var(--app-bg-input)",
                color: "var(--app-text-primary)",
                border: "1px solid var(--app-border-strong)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--app-border-strong)")}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition"
          >
            {loading ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>

          <p className="text-center text-xs" style={{ color: "var(--app-text-muted)" }}>
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="text-indigo-500 hover:text-indigo-400">
              Regístrate
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
