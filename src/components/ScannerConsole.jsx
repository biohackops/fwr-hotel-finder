import React, { useState, useEffect, useRef } from 'react';

export default function ScannerConsole({ hotel, isScanning, onScanComplete }) {
  const [logs, setLogs] = useState([]);
  const [step, setStep] = useState(0); // 0: standby, 1: scanning, 2: completed
  const logContainerRef = useRef(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Handle scan animation and hook in real server logs when done
  useEffect(() => {
    if (!hotel) {
      setLogs([]);
      setStep(0);
      return;
    }

    if (hotel.isScannedLive && hotel.serverLogs) {
      setLogs(hotel.serverLogs);
      setStep(2);
      if (onScanComplete) onScanComplete();
      return;
    }

    // Reset and show progress logs
    setLogs([]);
    setStep(1);

    const progressLogs = [
      { text: "⚡ INITIATING REAL-TIME FWR AUDIT...", delay: 100 },
      { text: "📡 Connecting to scraping backend (localhost:3001)...", delay: 500 },
      { text: "🌐 Crawling hotel website content (CORS proxy bypass)...", delay: 1500 },
      { text: "🔍 Searching Google Maps & loading reviews...", delay: 2800 },
      { text: "🤖 Scanning text for keywords: 'semi', 'truck', 'trailer'...", delay: 4200 },
      { text: "⏳ final-checking overhead clearances...", delay: 5500 }
    ];

    const timers = [];
    progressLogs.forEach((s, idx) => {
      const timer = setTimeout(() => {
        setLogs(prev => {
          // If we have already received the real logs, stop appending simulated ones
          if (hotel.isScannedLive && hotel.serverLogs) {
            return hotel.serverLogs;
          }
          return [...prev, `[${new Date().toLocaleTimeString()}] ${s.text}`];
        });
      }, s.delay);
      timers.push(timer);
    });

    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [hotel]);

  // Listen for transition from scanning to complete (real logs arrival)
  useEffect(() => {
    if (!isScanning && hotel?.isScannedLive && hotel?.serverLogs) {
      setLogs(hotel.serverLogs);
      setStep(2);
    }
  }, [isScanning, hotel]);

  if (!hotel) {
    return (
      <div className="glass-panel p-4 text-center font-mono" style={{ padding: '24px', borderStyle: 'dashed' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
          Select a hotel from the list or map to launch the FWR AI Parking & Site Scanner.
        </p>
      </div>
    );
  }

  const result = hotel.parkingScanResult;

  return (
    <div className="glass-panel scan-overlay" style={{ padding: '16px', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      
      {/* Console Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="pulse-active" style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: step === 1 ? 'var(--color-secondary)' : hotel.hasSemiParking ? 'var(--color-success)' : 'var(--color-danger)'
          }}></span>
          <span style={{ fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.05em' }} className="font-mono">
            FWR LIVE CRAWLER v2.0
          </span>
        </div>
        <span style={{
          fontSize: '11px',
          fontWeight: 'bold',
          padding: '2px 8px',
          borderRadius: '4px',
          fontFamily: 'JetBrains Mono',
          backgroundColor: step === 1 ? 'rgba(6, 182, 212, 0.15)' : hotel.hasSemiParking ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: step === 1 ? 'var(--color-secondary)' : hotel.hasSemiParking ? 'var(--color-success)' : 'var(--color-danger)'
        }}>
          {step === 1 ? 'CRAWLING...' : hotel.hasSemiParking ? 'VERIFIED SUITABLE' : 'UNSUITABLE'}
        </span>
      </div>

      {/* Terminal Output */}
      <div 
        ref={logContainerRef}
        className="font-mono"
        style={{
          height: '140px',
          background: 'rgba(0, 0, 0, 0.4)',
          borderRadius: '8px',
          padding: '10px',
          fontSize: '11px',
          overflowY: 'auto',
          color: 'var(--color-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          border: '1px solid rgba(6, 182, 212, 0.1)'
        }}
      >
        {logs.map((log, index) => (
          <div key={index} style={{ wordBreak: 'break-all' }}>{log}</div>
        ))}
        {step === 1 && (
          <div style={{ color: 'var(--color-text-secondary)', display: 'inline-block' }} className="pulse-active">
            _ [scraping Google Maps reviews...]
          </div>
        )}
      </div>

      {/* Scan Results (Displays after completing scan) */}
      {step === 2 && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', animation: 'fadeIn 0.5s ease-out' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Surface Area</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{result.surfaceDimension}</div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Clearance Rating</div>
              <div style={{ 
                fontSize: '12px', 
                fontWeight: '700', 
                color: result.clearanceStatus === 'EXCELLENT' ? 'var(--color-success)' : result.clearanceStatus === 'SUITABLE' ? 'var(--color-warning)' : 'var(--color-danger)'
              }}>
                {result.clearanceStatus}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '12px', background: 'rgba(255, 255, 255, 0.01)', borderLeft: '3px solid var(--color-secondary)', padding: '6px 10px' }}>
            <div style={{ fontWeight: '600', fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>Site Analysis</div>
            <div style={{ color: 'var(--color-text-primary)', fontSize: '11px', lineHeight: '1.4' }}>{result.clearanceNotes}</div>
          </div>

          <div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>Web Verification</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-primary)', fontStyle: 'italic', background: 'rgba(0,0,0,0.15)', padding: '6px', borderRadius: '4px', border: '1px dashed var(--border-light)' }}>
              "{result.websiteVerification}"
            </div>
          </div>

          {result.reviewsMatched && result.reviewsMatched.length > 0 ? (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>Scraped Driver Reviews</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {result.reviewsMatched.map((rev, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-accent)' }}>@{rev.author}</span>
                      <span style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>Live Snippet</span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-primary)', lineHeight: '1.3' }}>"{rev.text}"</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>Scraped Driver Reviews</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontStyle: 'italic', background: 'rgba(0,0,0,0.15)', padding: '8px', borderRadius: '6px', border: '1px dashed var(--border-light)' }}>
                No reviews found.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
