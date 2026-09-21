import { useState } from 'react';
import type { MeResponse } from '@opex/shared';
import { LoginPage } from './pages/LoginPage';
import { ChatPage } from './pages/ChatPage';

export function App() {
  const [user, setUser] = useState<MeResponse | null>(null);

  if (!user) {
    return <LoginPage onLoggedIn={setUser} />;
  }
  return <ChatPage user={user} onLoggedOut={() => setUser(null)} />;
}
