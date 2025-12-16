import { EnhancedChatLayout } from '../components/common';
import { EnhancedChatInput, EnhancedChatMessages } from '../components/inputs';
import { useChat } from '../services';

export default function PageChat() {
  const [{ messages }] = useChat();
  const hasMessages = messages.length > 0;

  return (
    <EnhancedChatLayout showWelcome={!hasMessages}>
      {hasMessages && <EnhancedChatMessages />}
      <EnhancedChatInput />
    </EnhancedChatLayout>
  );
}
