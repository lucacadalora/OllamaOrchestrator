import { useState, type FC } from 'react';
import { Box, IconButton, Stack, Typography, styled, Chip, Collapse } from '@mui/material';
import { IconX, IconMaximize, IconMinimize, IconCheck, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { NodeInfo, ClusterInfo } from '../../services';

interface InferenceBackendPanelProps {
  clusterInfo: ClusterInfo;
  nodes: readonly NodeInfo[];
  isOpen: boolean;
  onClose: () => void;
}

const PanelContainer = styled(Box)<{ expanded?: boolean }>(({ theme, expanded }) => ({
  position: 'fixed',
  top: theme.spacing(2),
  right: theme.spacing(2),
  width: expanded ? '600px' : '420px',
  maxHeight: 'calc(100vh - 2rem)',
  backgroundColor: theme.palette.common.white,
  borderRadius: '0.75rem',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
  border: `1px solid ${theme.palette.grey[200]}`,
  zIndex: 1200,
  overflow: 'hidden',
  transition: 'width 0.3s ease',
}));

const PanelHeader = styled(Stack)(({ theme }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.grey[200]}`,
}));

const PanelContent = styled(Stack)(({ theme }) => ({
  padding: theme.spacing(2),
  gap: theme.spacing(3),
  maxHeight: 'calc(100vh - 10rem)',
  overflowY: 'auto',
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  fontWeight: 500,
  color: theme.palette.grey[500],
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}));

const ModelName = styled(Typography)(({ theme }) => ({
  fontSize: '1.125rem',
  fontWeight: 600,
  color: theme.palette.brand.main,
}));

const WorkerCount = styled(Typography)(({ theme }) => ({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: theme.palette.brand.main,
}));

const StatusChip = styled(Chip)(({ theme }) => ({
  height: '1.5rem',
  fontSize: '0.75rem',
  fontWeight: 500,
  '& .MuiChip-icon': {
    fontSize: '0.875rem',
  },
}));

const WorkerCard = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1.5),
  borderRadius: '0.5rem',
  backgroundColor: theme.palette.grey[50],
  marginBottom: theme.spacing(1),
}));

const LayerBar = styled(Box)(({ theme }) => ({
  height: '1.5rem',
  backgroundColor: theme.palette.grey[200],
  borderRadius: '0.25rem',
  overflow: 'hidden',
  display: 'flex',
  gap: '2px',
  padding: '2px',
}));

const LayerBlock = styled(Box)<{ status: 'completed' | 'processing' | 'idle' | 'pending' }>(({ theme, status }) => ({
  flex: 1,
  borderRadius: '2px',
  backgroundColor:
    status === 'completed' ? theme.palette.brand.main :
    status === 'processing' ? '#3b82f6' :
    status === 'idle' ? theme.palette.grey[300] :
    theme.palette.grey[200],
  transition: 'background-color 0.3s ease',
}));

export const InferenceBackendPanel: FC<InferenceBackendPanelProps> = ({
  clusterInfo,
  nodes,
  isOpen,
  onClose,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isOpen) return null;

  const activeNodes = nodes.filter(n => n.status === 'available').length;
  const completedNodes = nodes.filter(n => n.status === 'available').length;

  return (
    <PanelContainer expanded={isExpanded}>
      <PanelHeader>
        <Typography variant="h6" fontWeight={600}>
          Inference Backend
        </Typography>
        <Stack direction="row" gap={0.5}>
          <IconButton
            size="small"
            onClick={() => setIsExpanded(!isExpanded)}
            sx={{ borderRadius: '0.375rem' }}
          >
            {isExpanded ? <IconMinimize size="1rem" /> : <IconMaximize size="1rem" />}
          </IconButton>
          <IconButton
            size="small"
            onClick={onClose}
            sx={{ borderRadius: '0.375rem' }}
          >
            <IconX size="1rem" />
          </IconButton>
        </Stack>
      </PanelHeader>

      <PanelContent>
        <Stack direction="row" gap={4}>
          <Stack gap={0.5}>
            <SectionTitle>Model</SectionTitle>
            <ModelName>{clusterInfo.modelName || 'No model selected'}</ModelName>
          </Stack>
          <Stack gap={0.5}>
            <SectionTitle>Distribution</SectionTitle>
            <Typography variant="body2" color="text.secondary">
              Distributed across {nodes.length} nodes
            </Typography>
          </Stack>
        </Stack>

        <Stack gap={0.5}>
          <SectionTitle>Workers</SectionTitle>
          <WorkerCount>{nodes.length}</WorkerCount>
        </Stack>

        <Stack gap={1}>
          <SectionTitle>Worker Status</SectionTitle>
          <StatusChip
            icon={<IconCheck size="0.875rem" />}
            label={`Completed (${completedNodes}/${nodes.length})`}
            color="success"
            variant="outlined"
            size="small"
          />
        </Stack>

        <Stack gap={1}>
          {nodes.map((node, idx) => (
            <WorkerNode key={node.id} node={node} index={idx} totalLayers={72} />
          ))}
        </Stack>
      </PanelContent>
    </PanelContainer>
  );
};

interface WorkerNodeProps {
  node: NodeInfo;
  index: number;
  totalLayers: number;
}

const hashCode = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

const WorkerNode: FC<WorkerNodeProps> = ({ node, index, totalLayers }) => {
  const nodeCount = 4;
  const layerStart = Math.floor(index * (totalLayers / nodeCount));
  const layerEnd = Math.floor((index + 1) * (totalLayers / nodeCount));
  const blocksServed = hashCode(node.id) % 100 + 50;

  const statusColor =
    node.status === 'available' ? 'brand' :
    node.status === 'waiting' ? 'info' :
    'error';

  const statusLabel =
    node.status === 'available' ? 'Completed' :
    node.status === 'waiting' ? 'Processing' :
    'Failed';

  return (
    <WorkerCard>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="body2" fontWeight={500}>
          {node.gpuName || 'GPU'} {node.gpuMemory ? `(${node.gpuMemory}GB)` : ''}
        </Typography>
        <Stack direction="row" gap={2} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Node {index + 1}
          </Typography>
          <Typography
            variant="caption"
            color={`${statusColor}.main`}
            fontWeight={500}
          >
            {statusLabel}
          </Typography>
        </Stack>
      </Stack>

      <LayerBar>
        {Array.from({ length: 24 }).map((_, i) => {
          const completedBlocks = node.status === 'available' ? 24 :
            node.status === 'waiting' ? Math.floor(hashCode(node.id + i.toString()) % 18) + 3 : 0;
          const status =
            i < completedBlocks ? (node.status === 'available' ? 'completed' : 'processing') :
            'pending';
          return <LayerBlock key={i} status={status} />;
        })}
      </LayerBar>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}
      >
        served {blocksServed} blocks
      </Typography>
    </WorkerCard>
  );
};

interface InferenceJobsSectionProps {
  nodes: readonly NodeInfo[];
  isExpanded: boolean;
  onToggle: () => void;
  activeNodeId?: string;
}

export const InferenceJobsSection: FC<InferenceJobsSectionProps> = ({
  nodes,
  isExpanded,
  onToggle,
  activeNodeId,
}) => {
  const activeNodes = nodes.filter(n => n.status === 'available').length;

  return (
    <Box sx={{ width: '100%', maxWidth: '48rem', mx: 'auto' }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 2,
          py: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'grey.50' },
          borderRadius: 1,
        }}
        onClick={onToggle}
      >
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="subtitle2" color="text.secondary">
            Inference Jobs
          </Typography>
          {activeNodes > 0 && (
            <Chip
              size="small"
              label={`${activeNodes} active`}
              color="success"
              variant="outlined"
              sx={{ height: '1.25rem', fontSize: '0.625rem' }}
            />
          )}
        </Stack>
        <IconButton size="small">
          {isExpanded ? <IconChevronUp size="1rem" /> : <IconChevronDown size="1rem" />}
        </IconButton>
      </Stack>

      <Collapse in={isExpanded}>
        <Box sx={{ px: 2, pb: 2 }}>
          {nodes.length > 0 ? (
            <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="center">
              {nodes.map((node) => (
                <Chip
                  key={node.id}
                  size="small"
                  icon={
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor:
                          node.status === 'available' ? 'brand.main' :
                          node.status === 'waiting' ? 'info.main' :
                          'grey.400',
                        animation: node.id === activeNodeId ? 'pulse 1.5s infinite' : 'none',
                      }}
                    />
                  }
                  label={`${node.gpuName || 'GPU'} ${node.gpuMemory ? `(${node.gpuMemory}GB)` : ''}`}
                  variant="outlined"
                  sx={{
                    borderColor: node.id === activeNodeId ? 'brand.main' : 'grey.300',
                  }}
                />
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
              No active inference jobs
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};
