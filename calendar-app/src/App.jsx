import { useEffect, useState } from 'react';
import riscvLogo from './assets/riscv-logo.png';
import './App.css';

function App() {
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  });
  const [viewMode, setViewMode] = useState(() => {
    return window.innerWidth < 768 ? 'AGENDA' : 'WEEK';
  });
  const [allTimezones] = useState(() => {
    if (Intl.supportedValuesOf) {
      return Intl.supportedValuesOf('timeZone');
    }
    return [];
  });

  useEffect(() => {
    // Responsive View Logic
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode('AGENDA');
      } else {
        setViewMode('WEEK');
      }
    };

    // Listen for resize
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!timezone) {
    return <div className="loading">Loading calendar...</div>;
  }

  const src = `https://www.google.com/calendar/embed?showPrint=0&showCalendars=0&mode=${viewMode}&height=100%&wkst=1&bgcolor=%23FFFFFF&src=tech.meetings%40riscv.org&color=%23AB8B00&ctz=${encodeURIComponent(timezone)}`;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand">
          <a href="https://riscv.org" target="_blank" rel="noopener noreferrer">
            <img src={riscvLogo} alt="RISC-V Logo" className="logo" />
          </a>
          <h1>Technical Meetings</h1>
        </div>
        <div className="controls">
          <nav className="header-links">
            <a href="https://openprofile.dev/my-meetings/" target="_blank" rel="noopener noreferrer">My Meetings (LFX)</a>
            <a href="https://openprofile.dev/" target="_blank" rel="noopener noreferrer">Openprofile.dev</a>
            <a href="https://riscv.atlassian.net/wiki/spaces/HOME/pages/16154865/RISC-V+Technical+Meetings" target="_blank" rel="noopener noreferrer">Guidelines</a>
            <a href="https://riscv.atlassian.net/wiki/spaces/HOME/pages/16154892/Meeting+Disclosures" target="_blank" rel="noopener noreferrer">Disclosures</a>
            <a href="https://riscv.org/code-of-conduct/" target="_blank" rel="noopener noreferrer">CoC</a>
          </nav>
          <div className="separator"></div>
          <select 
            value={timezone} 
            onChange={(e) => setTimezone(e.target.value)}
            className="timezone-select"
            aria-label="Select Timezone"
          >
            {allTimezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, ' ')}
              </option>
            ))}
            {!allTimezones.includes(timezone) && <option value={timezone}>{timezone}</option>}
          </select>
        </div>
      </header>
      <main className="calendar-container">
        <iframe 
          src={src} 
          width="100%" 
          height="100%" 
          frameBorder="0" 
          scrolling="no"
          title="RISC-V Technical Meetings Calendar"
        ></iframe>
      </main>
    </div>
  );
}

export default App;
