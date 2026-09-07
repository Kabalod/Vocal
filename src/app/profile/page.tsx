import { ProfileForm } from "@/components/ProfileForm";

export default function ProfilePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl">Анкета автора</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Один локальный профиль без аккаунтов. Данные не угадываются и не подставляются из прошлых чатов. Groq здесь
          не вызывается.
        </p>
      </div>
      <ProfileForm />
    </div>
  );
}
