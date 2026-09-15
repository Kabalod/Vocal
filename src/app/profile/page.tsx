import { ProfileConversation } from "@/components/ProfileConversation";
import { Panel } from "@/components/vocal-ui/Panel";

export default function ProfilePage() {
  return (
    <div className="space-y-8">
      <Panel>
        <h1 className="font-[family-name:var(--font-display)] text-4xl">Портрет автора</h1>
        <p className="mt-2 max-w-2xl font-content text-sm text-muted">
          Один локальный профиль. Vocal собирает портрет в разговоре и применяет изменения сам. Истории и кнопки
          сохранения нет. Анкета не обязательна, чтобы начать мысль.
        </p>
      </Panel>
      <ProfileConversation />
    </div>
  );
}
