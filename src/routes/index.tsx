import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChatifyApp } from "@/components/chatify/ChatifyApp";
import { getCurrentUser, logout } from "@/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (!user) {
      throw redirect({ to: "/auth", replace: true });
    }
    return { user };
  },
  component: Index,
});

function Index() {
  const { user } = Route.useRouteContext();
  const navigate = Route.useNavigate();

  return (
    <ChatifyApp
      session={user}
      onSignOut={async () => {
        await logout();
        navigate({ to: "/auth", replace: true });
      }}
    />
  );
}
