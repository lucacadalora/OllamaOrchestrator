import { useState, type FC, type PropsWithChildren } from 'react';
import { Box, Stack, Typography, styled, Button } from '@mui/material';
import { IconBrandGradient } from '../brand';
import { IconLayers } from '@tabler/icons-react';
import { useCluster } from '../../services';
import { InferenceBackendPanel, InferenceJobsSection, WorldMap } from '../inputs';

const LayoutRoot = styled(Stack)(({ theme }) => ({
  width: '100%',
  height: '100%',
  backgroundColor: theme.palette.grey[100],
  overflow: 'hidden',
}));

const Header = styled(Stack)(({ theme }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(2, 3),
  backgroundColor: 'rgba(255, 255, 255, 0.8)',
  backdropFilter: 'blur(8px)',
  borderBottom: `1px solid ${theme.palette.grey[200]}`,
  position: 'sticky',
  top: 0,
  zIndex: 10,
}));

const ContentContainer = styled(Stack)(({ theme }) => ({
  flex: 1,
  overflow: 'hidden',
  alignItems: 'center',
}));

const NetworkButton = styled(Button)(({ theme }) => ({
  height: '2.25rem',
  borderRadius: '0.5rem',
  textTransform: 'none',
  fontWeight: 500,
  fontSize: '0.875rem',
  gap: theme.spacing(1),
}));

interface EnhancedChatLayoutProps {
  showWelcome?: boolean;
}

export const EnhancedChatLayout: FC<PropsWithChildren<EnhancedChatLayoutProps>> = ({
  children,
  showWelcome = false,
}) => {
  const [{ clusterInfo, nodeInfoList }] = useCluster();
  const [showBackendPanel, setShowBackendPanel] = useState(false);
  const [showInferenceJobs, setShowInferenceJobs] = useState(true);

  return (
    <LayoutRoot>
      <Header>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <IconBrandGradient />
        </Stack>
        <NetworkButton
          variant="outlined"
          color="inherit"
          startIcon={<IconLayers size="1rem" />}
          onClick={() => setShowBackendPanel(true)}
          data-testid="button-explore-network"
        >
          Explore Network
        </NetworkButton>
      </Header>

      <ContentContainer>
        {showWelcome && (
          <WelcomeSection />
        )}
        
        {children}
        
        <InferenceJobsSection
          nodes={nodeInfoList}
          isExpanded={showInferenceJobs}
          onToggle={() => setShowInferenceJobs(!showInferenceJobs)}
        />
      </ContentContainer>

      <InferenceBackendPanel
        clusterInfo={clusterInfo}
        nodes={nodeInfoList}
        isOpen={showBackendPanel}
        onClose={() => setShowBackendPanel(false)}
      />
    </LayoutRoot>
  );
};

const WelcomeSection: FC = () => {
  const [{ nodeInfoList }] = useCluster();

  return (
    <Stack
      sx={{
        flex: 1,
        width: '100%',
        maxWidth: '48rem',
        px: 3,
        py: 6,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography
        variant="h2"
        sx={{
          fontSize: { xs: '2.5rem', md: '3.5rem' },
          fontWeight: 600,
          textAlign: 'center',
          mb: 4,
          background: 'linear-gradient(135deg, #111827 0%, #4b5563 50%, #111827 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Welcome to Gradient.
      </Typography>

      <Box sx={{ width: '100%', maxWidth: '32rem', mb: 4 }}>
        <WorldMap nodes={nodeInfoList} />
      </Box>

      <Stack
        direction="row"
        flexWrap="wrap"
        gap={2}
        justifyContent="center"
        sx={{ maxWidth: '40rem' }}
      >
        <SuggestionCard
          icon="💡"
          title="Get creative ideas"
          description="for a 10-year-old's birthday"
        />
        <SuggestionCard
          icon="📝"
          title="Draft an email"
          description="to request a meeting"
        />
        <SuggestionCard
          icon="🎨"
          title="Design a database schema"
          description="for a blog platform"
        />
        <SuggestionCard
          icon="🤔"
          title="Explain a concept"
          description="in simple terms"
        />
      </Stack>
    </Stack>
  );
};

interface SuggestionCardProps {
  icon: string;
  title: string;
  description: string;
  onClick?: () => void;
}

const SuggestionCard: FC<SuggestionCardProps> = ({ icon, title, description, onClick }) => {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        width: 'calc(50% - 0.5rem)',
        minWidth: '10rem',
        textAlign: 'left',
        p: 2,
        borderRadius: '0.75rem',
        border: '1px solid',
        borderColor: 'grey.200',
        backgroundColor: 'common.white',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: 'grey.300',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        },
      }}
      data-testid={`suggestion-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Typography fontSize="1.5rem" mb={1}>
        {icon}
      </Typography>
      <Typography variant="body2" fontWeight={500} color="text.primary" mb={0.5}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {description}
      </Typography>
    </Box>
  );
};
