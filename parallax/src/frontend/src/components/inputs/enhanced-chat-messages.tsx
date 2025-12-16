import { memo, useEffect, useRef, useState, type FC, type UIEventHandler } from 'react';
import { useChat, type ChatMessage } from '../../services';
import { Box, IconButton, Stack, Tooltip, Typography, styled, Collapse } from '@mui/material';
import { IconArrowDown, IconCopy, IconCopyCheck, IconRefresh, IconSparkles, IconChevronDown } from '@tabler/icons-react';
import { useRefCallback } from '../../hooks';
import ChatMarkdown from './chat-markdown';
import { DotPulse } from './dot-pulse';

const MessagesContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  flex: 1,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}));

const MessagesList = styled(Stack)(({ theme }) => ({
  width: '100%',
  height: '100%',
  maxWidth: '48rem',
  margin: '0 auto',
  padding: theme.spacing(2),
  overflowX: 'hidden',
  overflowY: 'auto',
  gap: theme.spacing(3),
  '&::-webkit-scrollbar': { display: 'none' },
  scrollbarWidth: 'none',
}));

const UserBubble = styled(Box)(({ theme }) => ({
  maxWidth: '80%',
  alignSelf: 'flex-end',
  padding: theme.spacing(1.5, 2),
  borderRadius: '1rem',
  backgroundColor: theme.palette.grey[100],
  fontSize: '0.9375rem',
  lineHeight: 1.6,
}));

const AssistantContainer = styled(Stack)(({ theme }) => ({
  width: '100%',
  gap: theme.spacing(1),
}));

const AssistantAvatar = styled(Box)(({ theme }) => ({
  width: '2rem',
  height: '2rem',
  borderRadius: '50%',
  background: `linear-gradient(135deg, ${theme.palette.brand.main} 0%, #3b82f6 100%)`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}));

const UserAvatar = styled(Box)(({ theme }) => ({
  width: '2rem',
  height: '2rem',
  borderRadius: '50%',
  backgroundColor: theme.palette.grey[900],
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: theme.palette.common.white,
  fontSize: '0.875rem',
  fontWeight: 500,
}));

const ThinkingToggle = styled(Stack)(({ theme }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: theme.spacing(1),
  padding: theme.spacing(1, 1.5),
  borderRadius: '0.5rem',
  border: `1px solid ${theme.palette.grey[200]}`,
  backgroundColor: theme.palette.common.white,
  cursor: 'pointer',
  userSelect: 'none',
  '&:hover': {
    backgroundColor: theme.palette.grey[50],
  },
}));

const ActionButtons = styled(Stack)(({ theme }) => ({
  flexDirection: 'row',
  gap: theme.spacing(0.5),
  marginTop: theme.spacing(0.5),
  opacity: 0,
  transition: 'opacity 0.15s ease',
}));

const MessageWrapper = styled(Stack)(({ theme }) => ({
  '&:hover .action-buttons': {
    opacity: 1,
  },
}));

const ScrollToBottomButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  right: theme.spacing(1.5),
  bottom: theme.spacing(1),
  width: '2rem',
  height: '2rem',
  backgroundColor: theme.palette.common.white,
  border: `1px solid ${theme.palette.grey[300]}`,
  '&:hover': {
    backgroundColor: theme.palette.grey[100],
  },
}));

export const EnhancedChatMessages: FC = () => {
  const [{ status, messages }] = useChat();
  const refContainer = useRef<HTMLDivElement>(null);
  const [isBottom, setIsBottom] = useState(true);
  const userScrolledUpRef = useRef(false);
  const autoScrollingRef = useRef(false);
  const prevScrollTopRef = useRef(0);

  const scrollToBottom = useRefCallback(() => {
    const el = refContainer.current;
    if (!el) return;
    userScrolledUpRef.current = false;
    autoScrollingRef.current = true;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    setTimeout(() => {
      autoScrollingRef.current = false;
    }, 250);
  });

  useEffect(() => {
    if (userScrolledUpRef.current) return;
    autoScrollingRef.current = true;
    scrollToBottom();
    const t = setTimeout(() => {
      autoScrollingRef.current = false;
    }, 200);
    return () => clearTimeout(t);
  }, [messages]);

  const onScroll = useRefCallback<UIEventHandler<HTMLDivElement>>((event) => {
    event.stopPropagation();
    const container = refContainer.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const bottomGap = scrollHeight - scrollTop - clientHeight;

    setIsBottom(bottomGap < 10);

    if (!autoScrollingRef.current) {
      if (scrollTop < prevScrollTopRef.current - 2) {
        userScrolledUpRef.current = true;
      }
    }
    prevScrollTopRef.current = scrollTop;

    if (bottomGap < 10) {
      userScrolledUpRef.current = false;
    }
  });

  return (
    <MessagesContainer>
      <MessagesList
        ref={refContainer}
        onScroll={onScroll}
        onWheel={(e) => {
          if (e.deltaY < 0) userScrolledUpRef.current = true;
        }}
      >
        {messages.map((message, idx) => (
          <EnhancedMessageBubble
            key={message.id}
            message={message}
            isLast={idx === messages.length - 1}
          />
        ))}

        {status === 'opened' && <ThinkingIndicator />}

        <Box sx={{ width: '100%', height: 0 }} />
      </MessagesList>

      <ScrollToBottomButton
        onClick={scrollToBottom}
        sx={{
          opacity: isBottom ? 0 : 1,
          pointerEvents: isBottom ? 'none' : 'auto',
        }}
      >
        <IconArrowDown size="1rem" />
      </ScrollToBottomButton>
    </MessagesContainer>
  );
};

const EnhancedMessageBubble: FC<{ message: ChatMessage; isLast?: boolean }> = memo(
  ({ message, isLast }) => {
    const { role, status: messageStatus, thinking, content, createdAt } = message;
    const [, { generate }] = useChat();
    const [copied, setCopied] = useState(false);
    const [showThinking, setShowThinking] = useState(false);

    useEffect(() => {
      const timeoutId = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timeoutId);
    }, [copied]);

    const onCopy = useRefCallback(async () => {
      try {
        await navigator.clipboard.writeText(content);
        setCopied(true);
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    });

    const onRegenerate = useRefCallback(() => {
      if (message.role === 'assistant' && message.status === 'done') {
        generate(message);
      }
    });

    const thinkingTime = message.createdAt ? ((Date.now() - message.createdAt) / 1000).toFixed(2) : null;

    if (role === 'user') {
      return (
        <MessageWrapper direction="row" justifyContent="flex-end" gap={1.5}>
          <Stack alignItems="flex-end" gap={0.5}>
            <UserBubble>{content}</UserBubble>
            <ActionButtons className="action-buttons">
              <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                <IconButton
                  onClick={onCopy}
                  size="small"
                  sx={{ width: 24, height: 24, borderRadius: '0.5rem' }}
                >
                  {copied ? <IconCopyCheck size="0.875rem" /> : <IconCopy size="0.875rem" />}
                </IconButton>
              </Tooltip>
            </ActionButtons>
          </Stack>
          <UserAvatar>U</UserAvatar>
        </MessageWrapper>
      );
    }

    const assistantDone = messageStatus === 'done';

    return (
      <MessageWrapper direction="row" gap={1.5} alignItems="flex-start">
        <AssistantAvatar>
          <IconSparkles size="1rem" color="white" />
        </AssistantAvatar>
        <AssistantContainer>
          {thinking && (
            <ThinkingToggle onClick={() => setShowThinking(!showThinking)}>
              <Typography variant="body2" color="text.secondary">
                Thought for {thinkingTime}s
              </Typography>
              <IconChevronDown
                size="1rem"
                style={{
                  transform: showThinking ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              />
            </ThinkingToggle>
          )}

          <Collapse in={showThinking}>
            <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1, mb: 1 }}>
              <ChatMarkdown isThinking content={thinking || ''} />
            </Box>
          </Collapse>

          {content && <ChatMarkdown content={content} />}

          {assistantDone && (
            <ActionButtons className="action-buttons">
              <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                <IconButton
                  onClick={onCopy}
                  size="small"
                  sx={{ width: 24, height: 24, borderRadius: '0.5rem' }}
                >
                  {copied ? <IconCopyCheck size="0.875rem" /> : <IconCopy size="0.875rem" />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Regenerate">
                <IconButton
                  onClick={onRegenerate}
                  size="small"
                  sx={{ width: 24, height: 24, borderRadius: '0.5rem' }}
                >
                  <IconRefresh size="0.875rem" />
                </IconButton>
              </Tooltip>
            </ActionButtons>
          )}
        </AssistantContainer>
      </MessageWrapper>
    );
  }
);

const ThinkingIndicator: FC = () => {
  return (
    <Stack direction="row" gap={1.5} alignItems="flex-start">
      <AssistantAvatar sx={{ animation: 'pulse 1.5s infinite' }}>
        <IconSparkles size="1rem" color="white" />
      </AssistantAvatar>
      <Box
        sx={{
          px: 2,
          py: 1.5,
          bgcolor: 'grey.100',
          borderRadius: '1rem',
        }}
      >
        <DotPulse size="medium" />
      </Box>
    </Stack>
  );
};
