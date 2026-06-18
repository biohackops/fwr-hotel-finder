import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Navigation, 
  DollarSign, 
  ExternalLink, 
  SlidersHorizontal, 
  Truck, 
  AlertCircle,
  HelpCircle,
  MapPin,
  Maximize2
} from 'lucide-react';

import MapArea from './components/MapArea';
import ScannerConsole from './components/ScannerConsole';
import { verifiedHotels, enrichDynamicHotels } from './mockData';

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [hotels, setHotels] = useState([]);
  const [filteredHotels, setFilteredHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filters
  const [maxBudget, setMaxBudget] = useState(250);
  const [onlySemiParking, setOnlySemiParking] = useState(true);

  // Map state
  const [mapCenter, setMapCenter] = useState([39.7684, -86.1581]); // Default to Indy
  const [currentCityName, setCurrentCityName] = useState('Indianapolis, IN');
  
  // Mobile responsive layout tab state
  const [mobileTab, setMobileTab] = useState('list'); // 'list' or 'map'

  // Blueprint overlay states
  const [blueprintCenter, setBlueprintCenter] = useState({ lat: 39.7285, lng: -86.2680 });
  const [blueprintAngle, setBlueprintAngle] = useState(0);
  const [showBlueprint, setShowBlueprint] = useState(true);

  // Scan simulation states
  const [isScanning, setIsScanning] = useState(false);

  // Load default Indy hotels on startup
  useEffect(() => {
    // Filter out verified hotels for Indy
    const indyHotels = verifiedHotels.filter(h => h.id.startsWith('indy-'));
    setHotels(indyHotels);
    
    // Set selected hotel to first one
    if (indyHotels.length > 0) {
      setSelectedHotel(indyHotels[0]);
      setBlueprintCenter({ lat: indyHotels[0].lat, lng: indyHotels[0].lon });
    }
  }, []);

  // Filter logic
  useEffect(() => {
    let result = hotels;

    // Apply budget filter
    result = result.filter(h => h.price <= maxBudget);

    // Apply semi truck parking filter
    if (onlySemiParking) {
      result = result.filter(h => h.hasSemiParking);
    }

    setFilteredHotels(result);
  }, [hotels, maxBudget, onlySemiParking]);

  // Synchronize blueprint center when selected hotel changes and trigger live scan
  const handleSelectHotel = async (hotel) => {
    setSelectedHotel(hotel);
    setBlueprintCenter({ lat: hotel.lat, lng: hotel.lon });
    setBlueprintAngle(0); // Reset angle

    // If already live-scanned, skip querying the crawler backend
    if (hotel.isScannedLive) {
      setIsScanning(false);
      return;
    }

    setIsScanning(true);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: hotel.name,
          address: hotel.address,
          website: hotel.website
        })
      });
      
      const data = await res.json();
      
      if (data && data.success) {
        const scannedData = {
          ...hotel,
          hasSemiParking: data.hasSemiParking,
          parkingScanResult: data.parkingScanResult,
          isScannedLive: true,
          serverLogs: data.logs
        };

        // Update in the central list
        setHotels(prev => prev.map(h => h.id === hotel.id ? scannedData : h));
        // Update selection
        setSelectedHotel(scannedData);
      }
    } catch (e) {
      console.warn("Live scraping server is offline or returned an error. Falling back to simulated heuristics.", e);
      // Fail gracefully: set a simulated flag after a minor delay
      setTimeout(() => {
        const mockScanned = {
          ...hotel,
          isScannedLive: true,
          serverLogs: [
            `[${new Date().toLocaleTimeString()}] ⚡ INITIATING LOCAL OFFLINE SCAN...`,
            `[${new Date().toLocaleTimeString()}] 📡 Warning: Local scraping backend offline.`,
            `[${new Date().toLocaleTimeString()}] 🤖 Running local offline heuristics...`,
            `[${new Date().toLocaleTimeString()}] ✅ Local Heuristics Scanned.`
          ]
        };
        setHotels(prev => prev.map(h => h.id === hotel.id ? mockScanned : h));
        setSelectedHotel(mockScanned);
        setIsScanning(false);
      }, 2000);
      return; // return early to let timeout handle isScanning(false)
    } finally {
      setIsScanning(false);
    }
  };

  // Perform search via OSM Nominatim
  // Fetch and enrich hotels by coordinates directly
  const searchHotelsByCoords = async (searchLat, searchLon, displayName, queryText = '') => {
    setIsLoading(true);
    setError(null);
    setSelectedHotel(null);
    setMapCenter([searchLat, searchLon]);
    setCurrentCityName(displayName);

    try {
      let hotelData = [];
      let bbox = null;

      // If text query is provided, look up its bounding box
      if (queryText) {
        const geocodeRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryText)}&format=json&limit=1`
        );
        const geocodeData = await geocodeRes.json();
        if (geocodeData.length > 0) {
          bbox = geocodeData[0].boundingbox;
        }
      }

      // Try bounding box first if we have one
      if (bbox && bbox.length === 4) {
        const [latMin, latMax, lonMin, lonMax] = bbox;
        const bboxUrl = `https://nominatim.openstreetmap.org/search?q=hotel&viewbox=${lonMin},${latMax},${lonMax},${latMin}&bounded=1&format=json&addressdetails=1&extratags=1&limit=40`;
        try {
          const res = await fetch(bboxUrl);
          hotelData = await res.json();
        } catch (e) {
          console.warn("Bounding box search failed, falling back to proximity search", e);
        }
      }

      // Proximity fallback (or if we have no text query/bounding box from geocoding)
      if (hotelData.length === 0) {
        // Calculate a bounding box: ~15km (0.15 degrees) around the coordinates to restrict search locally
        const delta = 0.15;
        const latMin = searchLat - delta;
        const latMax = searchLat + delta;
        const lonMin = searchLon - delta;
        const lonMax = searchLon + delta;
        
        const proximityUrl = `https://nominatim.openstreetmap.org/search?q=hotel&viewbox=${lonMin},${latMax},${lonMax},${latMin}&bounded=1&format=json&addressdetails=1&extratags=1&limit=35`;
        try {
          const res = await fetch(proximityUrl);
          hotelData = await res.json();
        } catch (e) {
          console.warn("Bounded proximity search failed", e);
        }

        // Deep fallback: If bounded search returns absolutely nothing, run biased search
        if (hotelData.length === 0) {
          const globalUrl = `https://nominatim.openstreetmap.org/search?q=hotel&lat=${searchLat}&lon=${searchLon}&format=json&addressdetails=1&extratags=1&limit=25`;
          const resGlobal = await fetch(globalUrl);
          hotelData = await resGlobal.json();
        }
      }

      let enriched = enrichDynamicHotels(hotelData, searchLat, searchLon);

      // Check for pre-coded city matches
      const qLower = (queryText || displayName).toLowerCase();
      let matchedVerified = [];

      if (qLower.includes('indiana') || qLower.includes('indy') || qLower.includes('school')) {
        matchedVerified = verifiedHotels.filter(h => h.id.startsWith('indy-'));
      } else if (qLower.includes('vegas') || qLower.includes('clark') || qLower.includes('nevada')) {
        matchedVerified = verifiedHotels.filter(h => h.id.startsWith('vegas-'));
      } else if (qLower.includes('orlando') || qLower.includes('universal') || qLower.includes('florida')) {
        matchedVerified = verifiedHotels.filter(h => h.id.startsWith('orlando-'));
      }

      // Remove duplicate names
      const verifiedIds = matchedVerified.map(h => h.name.toLowerCase());
      const filteredEnriched = enriched.filter(h => !verifiedIds.includes(h.name.toLowerCase()));
      const finalHotels = [...matchedVerified, ...filteredEnriched];

      setHotels(finalHotels);

      if (finalHotels.length > 0) {
        const firstMatch = finalHotels[0];
        setSelectedHotel(firstMatch);
        setBlueprintCenter({ lat: firstMatch.lat, lng: firstMatch.lon });
      } else {
        setError("No hotels found in this area.");
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during hotel search.');
    } finally {
      setIsLoading(false);
    }
  };

  // Perform search via OSM Nominatim
  const handleSearch = async (queryStr) => {
    const query = queryStr || searchQuery;
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setSelectedHotel(null);

    try {
      const geocodeRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
      );
      const geocodeData = await geocodeRes.json();

      if (geocodeData.length === 0) {
        throw new Error('Location not found. Try a different city name.');
      }

      const searchLat = parseFloat(geocodeData[0].lat);
      const searchLon = parseFloat(geocodeData[0].lon);
      const displayName = geocodeData[0].display_name.split(',')[0] + ', ' + (geocodeData[0].display_name.split(',')[2] || '');

      await searchHotelsByCoords(searchLat, searchLon, displayName, query);
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during search.');
      setIsLoading(false);
    }
  };

  // Browser Geolocation
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setIsLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        let prettyName = "Current Location";
        try {
          const revRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
          );
          const revData = await revRes.json();
          if (revData && revData.address) {
            const city = revData.address.city || revData.address.town || revData.address.village || revData.address.hamlet || revData.address.suburb || "Current Location";
            const state = revData.address.state ? `, ${revData.address.state}` : '';
            prettyName = `${city}${state}`;
          }
        } catch (err) {
          console.warn("Reverse geocode failed, using coordinates.", err);
        }

        setSearchQuery(prettyName === "Current Location" ? "" : prettyName);
        await searchHotelsByCoords(lat, lon, prettyName);
      },
      (err) => {
        setIsLoading(false);
        setError("Location permission denied. Please enter a location manually.");
      }
    );
  };

  return (
    <div className="app-container">
      
      {/* SIDEBAR */}
      <div 
        className={`sidebar-container ${mobileTab !== 'list' ? 'hidden-mobile' : ''}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          borderRight: '1px solid var(--border-light)',
          background: 'var(--bg-secondary)',
          zIndex: 10,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch' /* momentum scroll iOS */
        }}
      >
        {/* Brand Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(7, 11, 18, 0.4)'
        }}>
          {/* Animated Logo */}
          <div style={{ position: 'relative', width: '44px', height: '44px' }}>
            {/* Spinning Ferris Wheel Spokes */}
            <svg 
              className="spin-slow" 
              viewBox="0 0 100 100" 
              style={{ 
                width: '100%', 
                height: '100%', 
                color: 'var(--color-accent)',
                filter: 'drop-shadow(0 0 4px rgba(249, 115, 22, 0.5))'
              }}
            >
              <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="50" cy="50" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
              {/* Spokes */}
              <line x1="50" y1="10" x2="50" y2="90" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="1.5" />
              <line x1="22" y1="22" x2="78" y2="78" stroke="currentColor" strokeWidth="1.5" />
              <line x1="22" y1="78" x2="78" y2="22" stroke="currentColor" strokeWidth="1.5" />
              {/* Cabins */}
              <circle cx="50" cy="10" r="4" fill="var(--color-secondary)" />
              <circle cx="50" cy="90" r="4" fill="var(--color-secondary)" />
              <circle cx="10" cy="50" r="4" fill="var(--color-secondary)" />
              <circle cx="90" cy="50" r="4" fill="var(--color-secondary)" />
              <circle cx="22" cy="22" r="4" fill="var(--color-secondary)" />
              <circle cx="78" cy="78" r="4" fill="var(--color-secondary)" />
              <circle cx="22" cy="78" r="4" fill="var(--color-secondary)" />
              <circle cx="78" cy="22" r="4" fill="var(--color-secondary)" />
            </svg>
            {/* Semi Truck Overlay (stationary/vibrating in center) */}
            <div className="drive-shake" style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'var(--color-text-primary)'
            }}>
              <Truck size={15} fill="currentColor" />
            </div>
          </div>

          <div>
            <h1 style={{ fontSize: '21px', fontWeight: 'bold', color: 'white', lineHeight: '1.1' }}>
              FWR HOTEL FINDER
            </h1>
            <p style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>
              Ferris Wheel Rig logistics
            </p>
          </div>
        </div>

        {/* Search & Inputs */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search 
                size={16} 
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} 
              />
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search city (e.g. Las Vegas)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <button 
              onClick={() => handleSearch()}
              className="btn-primary"
              disabled={isLoading}
              style={{ padding: '10px' }}
            >
              <Search size={18} />
            </button>
          </div>

          <button 
            onClick={handleCurrentLocation}
            className="btn-secondary"
            disabled={isLoading}
            style={{ width: '100%', gap: '8px' }}
          >
            <Navigation size={15} />
            <span>Use Current Location</span>
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', background: 'rgba(7, 11, 18, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <SlidersHorizontal size={15} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--color-text-primary)' }}>Filters</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Price Filter */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Max Nightly Budget:</span>
                <span style={{ color: 'var(--color-accent)', fontWeight: 'bold' }}>${maxBudget}</span>
              </div>
              <input 
                type="range" 
                min="50" 
                max="300" 
                step="5"
                value={maxBudget}
                onChange={(e) => setMaxBudget(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--color-accent)', cursor: 'pointer' }}
              />
            </div>

            {/* Semi Parking Checkbox */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', color: 'var(--color-text-primary)' }}>
              <input 
                type="checkbox" 
                checked={onlySemiParking}
                onChange={(e) => setOnlySemiParking(e.target.checked)}
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: 'var(--color-accent)',
                  cursor: 'pointer'
                }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Truck size={14} style={{ color: 'var(--color-secondary)' }} />
                Requires Verified Semi-Truck Parking
              </span>
            </label>

            {/* Template Toggle Checkbox */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', color: 'var(--color-text-primary)' }}>
              <input 
                type="checkbox" 
                checked={showBlueprint}
                onChange={(e) => setShowBlueprint(e.target.checked)}
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: 'var(--color-secondary)',
                  cursor: 'pointer'
                }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Maximize2 size={14} style={{ color: 'var(--color-secondary)' }} />
                Enable 70ft Clearance Blueprint Overlay
              </span>
            </label>
          </div>
        </div>

        {/* Results Info or Error */}
        {error && (
          <div style={{ margin: '15px 20px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', display: 'flex', gap: '8px', color: 'var(--color-danger)' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '13.5px' }}>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              border: '3px solid rgba(249, 115, 22, 0.1)',
              borderTopColor: 'var(--color-accent)',
              borderRadius: '50%',
            }} className="spin-slow"></div>
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Searching area & scanning listings...</span>
          </div>
        ) : (
          <>
            {/* AI SCANNER CONSOLE IN SIDEBAR FOR HIGH VISIBILITY */}
            {selectedHotel && (
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', background: 'rgba(6, 182, 212, 0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} style={{ color: 'var(--color-accent)' }} />
                    <span style={{ fontSize: '13.5px', fontWeight: 'bold', color: 'white' }}>ACTIVE AUDIT</span>
                  </div>
                  <a 
                    href={selectedHotel.googleMapsUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ fontSize: '13px', color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
                  >
                    <span>Google Satellite</span>
                    <ExternalLink size={10} />
                  </a>
                </div>
                
                <h2 style={{ fontSize: '17.5px', fontWeight: 'bold', color: 'white', marginBottom: '4px' }}>
                  {selectedHotel.name}
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px', lineHeight: '1.3' }}>
                  {selectedHotel.address}
                </p>

                {/* Action & Booking Links */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <a 
                    href={selectedHotel.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    style={{ padding: '8px 12px', fontSize: '13px', gap: '4px', flex: 1, minWidth: '110px', textDecoration: 'none' }}
                  >
                    <span>Official Website</span>
                  </a>
                  <a 
                    href={`https://www.google.com/search?q=book+hotel+${encodeURIComponent(selectedHotel.name)}+${encodeURIComponent(selectedHotel.address)}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{ padding: '8px 12px', fontSize: '13px', gap: '4px', flex: 1, minWidth: '110px', textDecoration: 'none' }}
                  >
                    <span>🔑 Book Hotel</span>
                  </a>
                </div>

                <ScannerConsole 
                  hotel={selectedHotel} 
                  isScanning={isScanning} 
                  onScanComplete={() => setIsScanning(false)} 
                />
              </div>
            )}

            {/* HOTEL LIST */}
            <div style={{ flex: 1, padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                  Hotels in {currentCityName}
                </h3>
                <span style={{ fontSize: '13px', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 8px', borderRadius: '12px', color: 'var(--color-text-primary)' }}>
                  {filteredHotels.length} match{filteredHotels.length !== 1 ? 'es' : ''}
                </span>
              </div>

              {filteredHotels.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', border: '1px dashed var(--border-light)', borderRadius: '8px', color: 'var(--color-text-secondary)', fontSize: '13.5px' }}>
                  No hotels match the current filters. Adjust your budget or try unchecked truck parking.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredHotels.map((hotel) => {
                    const isSelected = selectedHotel && selectedHotel.id === hotel.id;
                    return (
                      <div 
                        key={hotel.id}
                        onClick={() => handleSelectHotel(hotel)}
                        className={isSelected ? 'glass-panel-accent' : 'glass-panel'}
                        style={{
                          padding: '14px',
                          cursor: 'pointer',
                          transition: 'var(--transition-smooth)',
                          background: isSelected ? 'rgba(249, 115, 22, 0.05)' : 'var(--bg-card)',
                          borderColor: isSelected ? 'var(--color-accent)' : 'var(--border-light)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <h4 style={{ fontSize: '15px', fontWeight: 'bold', color: 'white', flex: 1, paddingRight: '8px', lineHeight: '1.3' }}>
                            {hotel.name}
                          </h4>
                          <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-accent)' }}>
                            ${hotel.price}<span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>/nt</span>
                          </span>
                        </div>

                        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {hotel.address}
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '11.5px',
                            fontWeight: 'bold',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: hotel.hasSemiParking ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: hotel.hasSemiParking ? 'var(--color-success)' : 'var(--color-danger)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Truck size={11} />
                            {hotel.hasSemiParking ? 'Semi Truck Verified' : 'Standard Stalls Only'}
                          </span>

                          <span style={{ fontSize: '11.5px', color: 'var(--color-secondary)' }}>
                            {hotel.hasSemiParking && hotel.parkingScanResult ? 'Clearance: ' + hotel.parkingScanResult.clearanceStatus : 'No Clearance'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* MAP AREA */}
      <div className="map-container-wrapper" style={{ height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
        <MapArea 
          hotels={filteredHotels}
          selectedHotel={selectedHotel}
          onSelectHotel={handleSelectHotel}
          mapCenter={mapCenter}
          blueprintCenter={blueprintCenter}
          setBlueprintCenter={setBlueprintCenter}
          blueprintAngle={blueprintAngle}
          setBlueprintAngle={setBlueprintAngle}
          showBlueprint={showBlueprint}
        />
      </div>

      {/* Floating Pill Mobile Navigation (optimized for Safari iOS layout) */}
      <div className="mobile-nav-bar">
        <button 
          className={`mobile-nav-btn ${mobileTab === 'list' ? 'active' : ''}`}
          onClick={() => setMobileTab('list')}
        >
          📋 Search & Audit
        </button>
        <button 
          className={`mobile-nav-btn ${mobileTab === 'map' ? 'active' : ''}`}
          onClick={() => setMobileTab('map')}
        >
          🛰️ Satellite Map
        </button>
      </div>

    </div>
  );
}
