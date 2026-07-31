import { createContext, useContext, useState, type ReactNode } from "react";
import type { AuthUser } from '@/lib/types';

interface ChatifyContextType {
  activeConvId: string | null;
  setActiveConvId: (id: string | null) => void;
  theme: string;
  setTheme: (theme: string) => void;
  currentUser: AuthUser | null;
}

const ChatifyContext = createContext<ChatifyContextType | undefined>(undefined);

export function ChatifyProvider({ 
  children, 
  initialUser = null 
}: { 
  children: ReactNode; 
  initialUser?: AuthUser | null;
}) {
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>("peach");
  const [currentUser] = useState<AuthUser | null>(initialUser);

  return (
    <ChatifyContext.Provider
      value={{
        activeConvId,
        setActiveConvId,
        theme,
        setTheme,
        currentUser,
      }}
    >
      {children}
    </ChatifyContext.Provider>
  );
}

export function useChatify() {
  const context = useContext(ChatifyContext);
  if (context === undefined) {
    throw new Error('useChatify must be used within a ChatifyProvider');
  }
  return context;
}
