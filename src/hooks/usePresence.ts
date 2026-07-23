import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { IS_DEMO_MODE } from "@/lib/config";

export function usePresence(currentUserId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (IS_DEMO_MODE || !currentUserId) return;
    const supabase = getSupabase();

    const channel = supabase.channel("presence:global", {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const onlineIds = new Set<string>(Object.keys(state));
        setOnlineUsers(onlineIds);
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return onlineUsers;
}
