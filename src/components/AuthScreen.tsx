"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeReturnTo } from "@/lib/auth/return-to";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "forgot" | "update-password";

const COPY: Record<Mode, { title: string; submit: string }> = {
  login: { title: "Вход", submit: "Войти" },
  signup: { title: "Регистрация", submit: "Создать аккаунт" },
  forgot: { title: "Восстановление пароля", submit: "Отправить ссылку" },
  "update-password": { title: "Новый пароль", submit: "Сохранить пароль" },
};

export function AuthScreen({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const afterAuth = safeReturnTo(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError("Supabase не настроен.");
      return;
    }
    setPending(true);
    try {
      const origin = window.location.origin;
      if (mode === "login") {
        const { error: next } = await supabase.auth.signInWithPassword({ email, password });
        if (next) throw next;
        router.replace(afterAuth);
        router.refresh();
        return;
      }
      if (mode === "signup") {
        const { error: nextError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(afterAuth)}` },
        });
        if (nextError) throw nextError;
        setNotice("Проверьте почту и подтвердите адрес, затем войдите.");
        return;
      }
      if (mode === "forgot") {
        const { error: next } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/auth/update-password`,
        });
        if (next) throw next;
        setNotice("Если аккаунт есть, отправили ссылку на почту.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace(afterAuth);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось выполнить запрос.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
        Vocal
      </Link>
      <h1 className="mt-8 font-[family-name:var(--font-display)] text-3xl">{COPY[mode].title}</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {mode !== "update-password" ? (
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Почта</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-11 w-full rounded-[var(--vocal-radius-control)] border border-input-border bg-field px-3 text-text"
            />
          </label>
        ) : null}
        {mode !== "forgot" ? (
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Пароль</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-11 w-full rounded-[var(--vocal-radius-control)] border border-input-border bg-field px-3 text-text"
            />
          </label>
        ) : null}
        {error ? <p className="text-sm text-bad">{error}</p> : null}
        {notice ? <p className="text-sm text-muted">{notice}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-full bg-accent text-sm text-on-accent disabled:opacity-50"
        >
          {COPY[mode].submit}
        </button>
      </form>
      <nav className="mt-6 space-y-2 text-sm text-muted">
        {mode !== "login" ? (
          <p>
            <Link className="text-accent-soft" href={next ? `/login?next=${encodeURIComponent(afterAuth)}` : "/login"}>
              Вход
            </Link>
          </p>
        ) : null}
        {mode !== "signup" ? (
          <p>
            <Link className="text-accent-soft" href={next ? `/signup?next=${encodeURIComponent(afterAuth)}` : "/signup"}>
              Регистрация
            </Link>
          </p>
        ) : null}
        {mode !== "forgot" ? (
          <p>
            <Link className="text-accent-soft" href="/forgot-password">
              Забыли пароль
            </Link>
          </p>
        ) : null}
      </nav>
    </div>
  );
}
