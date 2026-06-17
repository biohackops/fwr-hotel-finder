import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix default leaflet icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper component to center map when selected hotel changes
function ChangeMapView({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      map.setView([coords[0], coords[1]], 18, {
        animate: true,
        duration: 1.5
      });
    }
  }, [coords]);
  return null;
}

export default function MapArea({ 
  hotels, 
  selectedHotel, 
  onSelectHotel, 
  mapCenter, 
  blueprintCenter,
  setBlueprintCenter,
  blueprintAngle,
  setBlueprintAngle,
  showBlueprint
}) {
  const [mapType, setMapType] = useState('satellite'); // 'streets' or 'satellite'
  const centerMarkerRef = useRef(null);

  // Math to generate scale-accurate 70ft x 15ft box centered at a latlng, rotated by an angle
  const getFootprintCoords = (center, angleDeg) => {
    if (!center) return [];
    
    // Normalize coordinates format
    const cLat = typeof center.lat === 'function' ? center.lat() : (center.lat ?? center[0]);
    const cLon = typeof center.lng === 'function' ? center.lng() : (center.lng ?? center[1]);
    
    const angleRad = (angleDeg * Math.PI) / 180;
    
    // Combined length of truck + Ferris wheel trailer is 70ft. Width is approx 15ft clear space.
    const halfLen = 35; // 70ft total / 2
    const halfWidth = 7.5; // 15ft total / 2
    
    // Corners relative to center in feet (x: length/direction of truck, y: width)
    const corners = [
      { x: halfLen, y: halfWidth },
      { x: halfLen, y: -halfWidth },
      { x: -halfLen, y: -halfWidth },
      { x: -halfLen, y: halfWidth }
    ];
    
    // Feet to Degrees translation factors
    const ftToLat = 2.747e-6; // 1 degree lat is ~364,000 feet
    const ftToLon = 2.747e-6 / Math.cos(cLat * Math.PI / 180);
    
    return corners.map(pt => {
      // Rotate point around origin (center)
      const rotatedX = pt.x * Math.cos(angleRad) - pt.y * Math.sin(angleRad);
      const rotatedY = pt.x * Math.sin(angleRad) + pt.y * Math.cos(angleRad);
      
      return [
        cLat + rotatedX * ftToLat,
        cLon + rotatedY * ftToLon
      ];
    });
  };

  const footprintPolygonCoords = getFootprintCoords(blueprintCenter, blueprintAngle);

  // Handle blueprint marker drag
  const eventHandlers = React.useMemo(
    () => ({
      dragend() {
        const marker = centerMarkerRef.current;
        if (marker != null) {
          const newLatLng = marker.getLatLng();
          setBlueprintCenter({ lat: newLatLng.lat, lng: newLatLng.lng });
        }
      },
    }),
    [setBlueprintCenter],
  );

  // Create custom DOM Marker Icon for hotels that shows the price
  const createHotelIcon = (hotel, isSelected) => {
    return L.divIcon({
      className: `custom-price-badge-container`,
      html: `
        <div class="price-badge ${isSelected ? 'selected' : ''} ${hotel.hasSemiParking ? 'has-parking' : 'no-parking'}">
          <span class="price-val">$${hotel.price}</span>
          ${hotel.hasSemiParking ? '<span class="semi-indicator">🚛</span>' : ''}
        </div>
      `,
      iconSize: [60, 32],
      iconAnchor: [30, 16]
    });
  };

  // Blueprint drag anchor icon
  const blueprintAnchorIcon = L.divIcon({
    className: 'blueprint-anchor-container',
    html: `
      <div class="blueprint-anchor-marker">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-slow">
          <circle cx="12" cy="12" r="10" stroke-dasharray="4 4" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  // Inject styling for price badges dynamically if not in css already
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .price-badge {
        background: #1e293b;
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        padding: 4px 8px;
        font-family: 'Space Grotesk', sans-serif;
        font-size: 13px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
        transition: all 0.2s ease;
        text-align: center;
      }
      .price-badge:hover {
        transform: scale(1.08);
      }
      .price-badge.selected {
        background: #f97316;
        color: white;
        border-color: white;
        box-shadow: 0 0 12px #f97316;
        transform: scale(1.1);
        z-index: 999;
      }
      .price-badge.has-parking {
        border-bottom: 2.5px solid #10b981;
      }
      .price-badge.no-parking {
        border-bottom: 2.5px solid #ef4444;
      }
      .price-badge.selected.has-parking {
        border-color: #10b981;
      }
      .price-badge.selected.no-parking {
        border-color: #ef4444;
      }
      .semi-indicator {
        font-size: 11px;
      }
      .blueprint-anchor-marker {
        color: #06b6d4;
        filter: drop-shadow(0 0 4px rgba(6, 182, 212, 0.8));
        cursor: grab;
      }
      .blueprint-anchor-marker:active {
        cursor: grabbing;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Map Tile Type Toggle (streets vs satellite) */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 1000,
        display: 'flex',
        gap: '4px'
      }} className="glass-panel p-1">
        <button 
          onClick={() => setMapType('satellite')} 
          className={`btn-secondary`}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '6px',
            background: mapType === 'satellite' ? '#1e293b' : 'transparent',
            borderColor: mapType === 'satellite' ? 'var(--color-secondary)' : 'transparent',
            color: mapType === 'satellite' ? 'var(--color-secondary)' : 'var(--color-text-secondary)'
          }}
        >
          🛰️ Satellite
        </button>
        <button 
          onClick={() => setMapType('streets')} 
          className={`btn-secondary`}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '6px',
            background: mapType === 'streets' ? '#1e293b' : 'transparent',
            borderColor: mapType === 'streets' ? 'var(--color-secondary)' : 'transparent',
            color: mapType === 'streets' ? 'var(--color-secondary)' : 'var(--color-text-secondary)'
          }}
        >
          🗺️ Streets
        </button>
      </div>

      <MapContainer 
        center={mapCenter} 
        zoom={13} 
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%' }}
      >
        {mapType === 'streets' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}

        <ChangeMapView coords={selectedHotel ? [selectedHotel.lat, selectedHotel.lon] : mapCenter} />

        {/* Hotel Markers */}
        {hotels.map((hotel) => (
          <Marker
            key={hotel.id}
            position={[hotel.lat, hotel.lon]}
            icon={createHotelIcon(hotel, selectedHotel && selectedHotel.id === hotel.id)}
            eventHandlers={{
              click: () => onSelectHotel(hotel)
            }}
          />
        ))}

        {/* 70ft Scale Footprint Template */}
        {showBlueprint && blueprintCenter && (
          <>
            {/* Outline of the 70ft combined rig */}
            <Polygon 
              positions={footprintPolygonCoords}
              pathOptions={{ 
                color: '#06b6d4', 
                fillColor: '#06b6d4', 
                fillOpacity: 0.2, 
                weight: 2, 
                dashArray: '3, 4',
                lineCap: 'round'
              }}
            />
            {/* Draggable center anchor */}
            <Marker
              position={[blueprintCenter.lat, blueprintCenter.lng]}
              draggable={true}
              eventHandlers={eventHandlers}
              ref={centerMarkerRef}
              icon={blueprintAnchorIcon}
            />
          </>
        )}
      </MapContainer>

      {/* Blueprint Control Panel */}
      {showBlueprint && (
        <div className="blueprint-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--color-secondary)' }}>FWR RIG DIMENSION GUIDE</span>
            <span style={{ fontSize: '11px', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--color-secondary)', padding: '2px 6px', borderRadius: '4px' }}>SCALE: 1:1</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
            A 70ft x 15ft scale template represents the combined truck + Ferris wheel trailer setup. Drag the anchor on the map to verify turning space and parking clearance.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', color: 'var(--color-text-primary)' }}>Rig Orientation: {blueprintAngle}°</label>
              <button 
                onClick={() => setBlueprintAngle((prev) => (prev + 90) % 360)}
                className="btn-secondary"
                style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px' }}
              >
                🔄 Rotate 90°
              </button>
            </div>
            <input 
              type="range" 
              min="0" 
              max="359" 
              value={blueprintAngle}
              onChange={(e) => setBlueprintAngle(parseInt(e.target.value))}
              style={{
                width: '100%',
                accentColor: 'var(--color-secondary)',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
