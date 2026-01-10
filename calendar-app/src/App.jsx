import { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [timezone, setTimezone] = useState('');

  useEffect(() => {
    // Detect timezone using the modern Intl API
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(userTimezone);
  }, []);

  if (!timezone) {
    return <div>Loading calendar...</div>;
  }

  const src = `https://www.google.com/calendar/embed?showPrint=0&showCalendars=0&mode=MONTH&height=100%&wkst=1&bgcolor=%23FFFFFF&src=tech.meetings%40riscv.org&color=%23AB8B00&ctz=${encodeURIComponent(timezone)}`;

  return (
    <div className="calendar-container">
      <iframe 
        src={src} 
        width="100%" 
        height="100%" 
        frameBorder="0" 
        scrolling="no"
        title="RISC-V Technical Meetings Calendar"
      ></iframe>
    </div>
  );
}

export default App;