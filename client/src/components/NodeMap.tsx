import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Node } from '@shared/schema';

// Fix for default marker icons in React Leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface NodeMapProps {
  nodes: Node[];
}

// Component to auto-fit bounds when nodes change
function AutoFitBounds({ nodes }: { nodes: Node[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (nodes.length === 0) return;
    
    const validNodes = nodes.filter(n => n.latitude && n.longitude);
    if (validNodes.length === 0) return;
    
    const bounds = L.latLngBounds(
      validNodes.map(n => [parseFloat(n.latitude!), parseFloat(n.longitude!)] as [number, number])
    );
    
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [nodes, map]);
  
  return null;
}

export function NodeMap({ nodes }: NodeMapProps) {
  const nodesWithLocation = nodes.filter(n => n.latitude && n.longitude);
  
  if (nodesWithLocation.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-muted/30 rounded-lg border border-border" data-testid="map-empty-state">
        <div className="text-center p-8">
          <p className="text-muted-foreground mb-2">No nodes with location data yet</p>
          <p className="text-sm text-muted-foreground">
            Node locations will appear here once they send heartbeats
          </p>
        </div>
      </div>
    );
  }

  // Calculate center point (average of all coordinates)
  const centerLat = nodesWithLocation.reduce((sum, n) => sum + parseFloat(n.latitude!), 0) / nodesWithLocation.length;
  const centerLng = nodesWithLocation.reduce((sum, n) => sum + parseFloat(n.longitude!), 0) / nodesWithLocation.length;

  return (
    <div className="h-[500px] rounded-lg overflow-hidden border border-border" data-testid="node-map">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={2}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AutoFitBounds nodes={nodesWithLocation} />
        {nodesWithLocation.map((node) => (
          <Marker
            key={node.id}
            position={[parseFloat(node.latitude!), parseFloat(node.longitude!)]}
          >
            <Popup>
              <div className="space-y-1">
                <p className="font-semibold">{node.id}</p>
                <p className="text-sm">
                  {node.city}, {node.country}
                </p>
                <p className="text-sm text-muted-foreground">
                  Status: <span className={
                    node.status === 'active' ? 'text-green-600' : 
                    node.status === 'pending' ? 'text-yellow-600' : 
                    'text-gray-600'
                  }>{node.status}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Runtime: {node.runtime}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
