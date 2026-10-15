"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DeleteAccountRow } from "@/components/DeleteActions";
import { LogoutButton } from "@/components/LogoutButton";
import { ProfileConversation } from "@/components/ProfileConversation";
import { IosNavBar } from "@/components/vocal-ui/IosNavBar";
import { Panel } from "@/components/vocal-ui/Panel";

type QuotaView = { enforced: boolean; exempt: boolean; hasPeriod: boolean; thoughtsLimit: number; thoughtsUsed: number; remaining: number; periodEnd: string | null };

/** The thought quota is shown only when the quota is enforced for this author; otherwise there is no block at all. */
export function quotaLine(quota: QuotaView | null): string | null {
  if (!quota || !quota.enforced || quota.exempt) return null;
  if (!quota.hasPeriod) return "Нет оплаченного периода";
  const end = quota.periodEnd ? new Date(quota.periodEnd) : null;
  const until = end && !Number.isNaN(end.getTime()) ? ` · до ${end.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : "";
  return `Мыслей осталось ${quota.remaining} из ${quota.thoughtsLimit}${until}`;
}

export function AccountCard({ email, quota }: { email: string | null; quota: QuotaView | null }) {
  const line = quotaLine(quota);
  return (
    <Panel data-account-card className="divide-y divide-line !p-0" aria-label="Аккаунт">
      <div className="space-y-1 px-4 py-3">
        <p className="text-xs text-muted">Аккаунт</p>
        <p className="break-all text-sm" data-account-email>
          {email ?? "Почта не указана"}
        </p>
        {line ? (
          <p className="text-sm text-muted" data-account-quota>
            {line}
          </p>
        ) : null}
      </div>
      <LogoutButton className="flex min-h-11 w-full items-center px-4 text-left text-sm hover:bg-white/5" />
      <DeleteAccountRow />
    </Panel>
  );
}

/** Profile (07): the portrait of the author on the left, the account card on the right (below on touch). */
export function ProfileScreen({ email }: { email: string | null }) {
  const router = useRouter();
  const [quota, setQuota] = useState<QuotaView | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/account/quota", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { quota?: QuotaView } | null) => {
        if (alive && data?.quota) setQuota(data.quota);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="min-w-0 max-w-full overflow-x-hidden break-words">
      <div className="-mx-4 -mt-6 mb-4 shell:hidden">
        <IosNavBar title="Профиль" backLabel="Мысли" onBack={() => router.push("/reels")} />
      </div>
      <h1 className="mb-4 font-[family-name:var(--font-display)] text-3xl shell:text-2xl" data-profile-title>
        Профиль
      </h1>
      <div className="grid min-w-0 gap-6 shell:grid-cols-[minmax(0,1fr)_320px] shell:items-start">
        <div className="min-w-0">
          <p className="sr-only font-content">Профиль автора</p>
          <ProfileConversation presentation="page" />
        </div>
        <aside className="min-w-0 space-y-3 shell:sticky shell:top-6">
          <AccountCard email={email} quota={quota} />
        </aside>
      </div>
    </div>
  );
}
