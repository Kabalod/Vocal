import { ProfileConversation } from "@/components/ProfileConversation";
import { Panel } from "@/components/vocal-ui/Panel";

export default function ProfilePage() {
  return (
    <div className="min-w-0 max-w-full overflow-x-hidden break-words">
      <p className="sr-only font-content">Профиль автора</p>
      <Panel className="min-w-0 overflow-x-hidden border-0 bg-transparent p-0">
        <ProfileConversation />
      </Panel>
    </div>
  );
}
