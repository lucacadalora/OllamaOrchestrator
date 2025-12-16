import { useMemo, type FC } from 'react';
import { Box, styled } from '@mui/material';
import type { NodeInfo } from '../../services';

interface WorldMapProps {
  nodes?: readonly NodeInfo[];
  activeNodeId?: string;
}

const MapContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  width: '100%',
  height: '12rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
}));

const hashCode = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

export const WorldMap: FC<WorldMapProps> = ({ nodes = [], activeNodeId }) => {
  const nodeLocations = useMemo(() => {
    return nodes.map((node, idx) => {
      const hash = hashCode(node.id);
      return {
        id: node.id,
        x: 15 + ((hash % 70) + idx * 3) % 70,
        y: 15 + ((hash % 40) + idx * 5) % 40,
        status: node.status,
        isActive: node.id === activeNodeId,
      };
    });
  }, [nodes, activeNodeId]);

  return (
    <MapContainer>
      <svg
        viewBox="0 0 100 60"
        style={{ width: '100%', height: '100%', maxWidth: '600px' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="worldDots" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.4" fill="#d1d5db" />
          </pattern>
        </defs>

        <rect width="100" height="60" fill="url(#worldDots)" />

        <g opacity="0.3">
          <ellipse cx="25" cy="25" rx="12" ry="8" fill="#d1d5db" />
          <ellipse cx="55" cy="20" rx="15" ry="10" fill="#d1d5db" />
          <ellipse cx="75" cy="25" rx="10" ry="8" fill="#d1d5db" />
          <ellipse cx="35" cy="40" rx="8" ry="6" fill="#d1d5db" />
          <ellipse cx="85" cy="45" rx="6" ry="5" fill="#d1d5db" />
        </g>

        {nodeLocations.map((node, idx) => {
          const color =
            node.status === 'available' ? '#05aa6c' :
            node.status === 'waiting' ? '#3b82f6' :
            '#9ca3af';

          return (
            <g key={node.id}>
              {idx > 0 && nodeLocations[idx - 1] && (
                <line
                  x1={nodeLocations[idx - 1].x}
                  y1={nodeLocations[idx - 1].y}
                  x2={node.x}
                  y2={node.y}
                  stroke={color}
                  strokeWidth="0.3"
                  opacity="0.4"
                />
              )}
              <circle
                cx={node.x}
                cy={node.y}
                r={node.isActive ? 2 : 1.5}
                fill={color}
                opacity={node.isActive ? 1 : 0.8}
              >
                {node.isActive && (
                  <animate
                    attributeName="r"
                    values="1.5;2.5;1.5"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>
              {node.isActive && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="3"
                  fill="none"
                  stroke={color}
                  strokeWidth="0.3"
                  opacity="0.5"
                >
                  <animate
                    attributeName="r"
                    values="2;4;2"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.5;0;0.5"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          );
        })}
      </svg>
    </MapContainer>
  );
};
