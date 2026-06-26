import { useState, useEffect } from 'react';
import PrayerTimes from './components/PrayerTimes';

function App() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('');

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          // Fallback to Mecca
          setLocation({ latitude: 21.4225, longitude: 39.8264 });
          setLocationName('Mecca, Saudi Arabia');
        }
      );
    }
  }, []);

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
      {location ? (
        <PrayerTimes location={location} locationName={locationName} onLocationChange={(loc, name) => {
          setLocation(loc);
          setLocationName(name);
        }} />
      ) : (
        <div className="w-full h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 mx-auto mb-4"></div>
            <p className="text-xl">Getting your location...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
