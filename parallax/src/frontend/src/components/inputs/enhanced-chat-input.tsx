import { useRef, useState, type CompositionEventHandler, type FC, type KeyboardEventHandler, type MouseEventHandler } from 'react';
import { Box, Button, IconButton, Stack, TextField, Typography, styled, Select, MenuItem, Chip } from '@mui/material';
import { IconArrowUp, IconPhoto, IconPaperclip, IconSparkles, IconSquareFilled } from '@tabler/icons-react';
import { useRefCallback } from '../../hooks';
import { useChat, useCluster } from '../../services';
import { DotPulse } from './dot-pulse';

const InputContainer = styled(Stack)(({ theme }) => ({
  width: '100%',
  maxWidth: '48rem',
  margin: '0 auto',
  padding: theme.spacing(2),
}));

const InputWrapper = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  padding: theme.spacing(1.5),
  border: '1px solid',
  borderColor: theme.palette.grey[300],
  borderRadius: '1rem',
  backgroundColor: theme.palette.common.white,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
  '&:focus-within': {
    borderColor: theme.palette.primary.main,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
  },
}));

const ActionRow = styled(Stack)(({ theme }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: theme.spacing(1),
  paddingTop: theme.spacing(0.5),
}));

const ThinkingChip = styled(Chip)<{ active?: boolean }>(({ theme, active }) => ({
  height: '2rem',
  borderRadius: '0.5rem',
  border: '1px solid',
  borderColor: active ? theme.palette.brand.main : theme.palette.grey[300],
  backgroundColor: active ? theme.palette.brand.lighter : 'transparent',
  color: active ? theme.palette.brand.main : theme.palette.text.secondary,
  fontWeight: 500,
  '&:hover': {
    backgroundColor: active ? theme.palette.brand.lighter : theme.palette.grey[100],
  },
  '& .MuiChip-icon': {
    color: 'inherit',
  },
}));

const ModelSelector = styled(Select)(({ theme }) => ({
  height: '2rem',
  minWidth: '8rem',
  borderRadius: '0.5rem',
  backgroundColor: 'transparent',
  fontSize: '0.875rem',
  fontWeight: 500,
  '& .MuiOutlinedInput-notchedOutline': {
    border: 'none',
  },
  '& .MuiSelect-select': {
    paddingRight: theme.spacing(3),
  },
}));

const SendButton = styled(IconButton)<{ disabled?: boolean }>(({ theme, disabled }) => ({
  width: '2.25rem',
  height: '2.25rem',
  borderRadius: '0.625rem',
  backgroundColor: disabled ? theme.palette.grey[200] : theme.palette.brand.main,
  color: disabled ? theme.palette.grey[400] : theme.palette.common.white,
  '&:hover': {
    backgroundColor: disabled ? theme.palette.grey[200] : theme.palette.brand.dark,
  },
}));

const ActionButton = styled(IconButton)(({ theme }) => ({
  width: '2rem',
  height: '2rem',
  borderRadius: '0.5rem',
  color: theme.palette.grey[600],
  '&:hover': {
    backgroundColor: theme.palette.grey[100],
  },
}));

export const EnhancedChatInput: FC = () => {
  const [
    {
      clusterInfo: { status: clusterStatus, modelName: clusterModelName },
      config: { modelName: configModelName, modelInfoList },
    },
    { config: { setModelName } },
  ] = useCluster();
  const [{ input, status }, { setInput, generate, stop }] = useChat();
  const [thinkingEnabled, setThinkingEnabled] = useState(true);

  const compositionRef = useRef(false);

  const onCompositionStart = useRefCallback<CompositionEventHandler>(() => {
    compositionRef.current = true;
  });

  const onCompositionEnd = useRefCallback<CompositionEventHandler>(() => {
    compositionRef.current = false;
  });

  const onKeyDown = useRefCallback<KeyboardEventHandler>((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !compositionRef.current) {
      e.preventDefault();
      generate();
    }
  });

  const onClickMainButton = useRefCallback<MouseEventHandler>(() => {
    if (status === 'opened' || status === 'generating') {
      stop();
    } else if (status === 'closed' || status === 'error') {
      generate();
    }
  });

  const isDisabled = clusterStatus !== 'available' || status === 'opened';
  const isGenerating = status === 'generating' || status === 'opened';

  return (
    <InputContainer>
      <InputWrapper>
        <TextField
          value={input}
          onChange={(event) => setInput(event.target.value)}
          multiline
          maxRows={6}
          placeholder="How can I help you today?"
          fullWidth
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          onKeyDown={onKeyDown}
          variant="standard"
          slotProps={{
            input: {
              disableUnderline: true,
              sx: {
                fontSize: '0.9375rem',
                lineHeight: 1.6,
                '& textarea': {
                  scrollbarWidth: 'none',
                  '&::-webkit-scrollbar': {
                    display: 'none',
                  },
                },
              },
            },
          }}
        />

        <ActionRow>
          <ActionButton title="Upload image" data-testid="button-upload-image">
            <IconPhoto size="1.25rem" />
          </ActionButton>
          <ActionButton title="Attach file" data-testid="button-attach-file">
            <IconPaperclip size="1.25rem" />
          </ActionButton>

          <ThinkingChip
            icon={<IconSparkles size="1rem" />}
            label="Thinking"
            active={thinkingEnabled}
            onClick={() => setThinkingEnabled(!thinkingEnabled)}
            data-testid="button-thinking-toggle"
          />

          <Box sx={{ flex: 1 }} />

          <ModelSelector
            value={configModelName || ''}
            onChange={(e) => setModelName(e.target.value as string)}
            displayEmpty
            data-testid="select-model"
          >
            {modelInfoList.map((model) => (
              <MenuItem key={model.name} value={model.name}>
                {model.displayName || model.name}
              </MenuItem>
            ))}
          </ModelSelector>

          <SendButton
            onClick={onClickMainButton}
            disabled={isDisabled || !input.trim()}
            data-testid="button-send"
          >
            {status === 'opened' ? (
              <DotPulse size="small" />
            ) : isGenerating ? (
              <IconSquareFilled size="1rem" />
            ) : (
              <IconArrowUp size="1.25rem" />
            )}
          </SendButton>
        </ActionRow>
      </InputWrapper>

      <Typography
        variant="caption"
        sx={{
          textAlign: 'center',
          color: 'grey.500',
          mt: 1.5,
        }}
      >
        Gradient can make mistakes. Consider checking important information.
      </Typography>
    </InputContainer>
  );
};
