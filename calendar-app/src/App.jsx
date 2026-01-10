import { useEffect, useState } from 'react';
import riscvLogo from './assets/riscv-logo.png';
import './App.css';

function App() {
  const [timezone, setTimezone] = useState('');
  const [viewMode, setViewMode] = useState('WEEK');
  const [allTimezones, setAllTimezones] = useState([]);

  useEffect(() => {
    // 1. Detect Initial Timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(userTimezone);

    // 2. Populate Timezone List
    if (Intl.supportedValuesOf) {
      setAllTimezones(Intl.supportedValuesOf('timeZone'));
    }

    // 3. Responsive View Logic
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode('AGENDA');
      } else {
        setViewMode('WEEK');
      }
    };

    // Initial check
    handleResize();

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
          <img src={riscvLogo} alt="RISC-V Logo" className="logo" />
          <h1>Technical Meetings</h1>
        </div>
        <div className="controls">
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