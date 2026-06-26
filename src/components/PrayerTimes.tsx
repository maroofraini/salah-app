import { useState, useEffect } from 'react';

interface PrayerTimesProps {
  location: { latitude: number; longitude: number };
  locationName: string;
  onLocationChange: (location: { latitude: number; longitude: number }, name: string) => void;
}

interface Prayer {
  name: string;
  time: string;
  isActive: boolean;
  isComing: boolean;
}

interface ApiResponse {
  data: {
    timings: {
      Fajr: string;
      Sunrise: string;
      Dhuhr: string;
      Asr: string;
      Sunset: string;
      Maghrib: string;
      Isha: string;
    };
    date: {
      gregorian: {
        date: string;
        day: string;
        month: string;
        year: string;
      };
      hijri: {
        date: string;
        day: string;
        month: string;
        year: string;
      };
    };
  };
}

interface WeatherData {
  temperature: number;
  weatherCode: number;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
}

interface HourlyWeather {
  time: string;
  temperature: number;
  weatherCode: number;
}

interface DailyWeather {
  day: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
}

const getTimeUntilNextPrayer = (currentTime: Date, prayers: Prayer[]): { hours: number; mins: number; prayer: string } => {
  const currentTimeInMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  // Find the current/next prayer
  let currentPrayer = null;
  let nextPrayerTime = null;
  for (const prayer of prayers) {
    const [hours, minutes] = prayer.time.split(':').map(Number);
    const prayerTimeInMinutes = hours * 60 + minutes;
    if (prayerTimeInMinutes > currentTimeInMinutes) {
      nextPrayerTime = prayerTimeInMinutes;
      // Get the previous prayer as the current one
      break;
    }
    currentPrayer = prayer;
  }

  // If no prayer found, use the last prayer as current
  if (!currentPrayer) {
    currentPrayer = prayers[prayers.length - 1];
  }

  // If no next prayer found today, first prayer is tomorrow
  if (!nextPrayerTime) {
    const [hours, minutes] = prayers[0].time.split(':').map(Number);
    nextPrayerTime = hours * 60 + minutes + 24 * 60;
  }

  let timeRemaining = nextPrayerTime - currentTimeInMinutes;
  if (timeRemaining <= 0) {
    timeRemaining += 24 * 60;
  }

  const hours = Math.floor(timeRemaining / 60);
  const mins = timeRemaining % 60;

  return {
    prayer: currentPrayer.name,
    hours: hours,
    mins: mins
  };
};

const formatTo12Hour = (time: string): { time: string; period: string } => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return {
    time: `${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
    period: period
  };
};

const getWeatherIcon = (code: number): string => {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code === 51 || code === 53 || code === 55) return '🌧️';
  if (code === 61 || code === 63 || code === 65) return '🌧️';
  if (code === 71 || code === 73 || code === 75) return '❄️';
  if (code === 77) return '❄️';
  if (code === 80 || code === 81 || code === 82) return '🌧️';
  if (code === 85 || code === 86) return '❄️';
  if (code === 95 || code === 96 || code === 99) return '⛈️';
  return '🌤️';
};

const celsiusToFahrenheit = (celsius: number): number => {
  return Math.round((celsius * 9/5) + 32);
};

const getTemperatureDisplay = (celsius: number, unit: 'C' | 'F'): { temp: number; unit: string } => {
  if (unit === 'F') {
    return { temp: celsiusToFahrenheit(celsius), unit: '°F' };
  }
  return { temp: celsius, unit: '°C' };
};

const getWeatherDescription = (code: number): string => {
  if (code === 0) return 'Clear Sky';
  if (code === 1 || code === 2) return 'Mostly Clear';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if (code === 51 || code === 53 || code === 55) return 'Drizzle';
  if (code === 61 || code === 63 || code === 65) return 'Rain';
  if (code === 71 || code === 73 || code === 75) return 'Snow';
  if (code === 77) return 'Snow Grains';
  if (code === 80 || code === 81 || code === 82) return 'Rain Showers';
  if (code === 85 || code === 86) return 'Snow Showers';
  if (code === 95 || code === 96 || code === 99) return 'Thunderstorm';
  return 'Unknown';
};

const PrayerTimes: React.FC<PrayerTimesProps> = ({ location, locationName }) => {
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [, setNextPrayer] = useState<Prayer | null>(null);
  const [gregorianDate, setGregorianDate] = useState({ day: '', month: '', year: '' });
  const [hijriDate, setHijriDate] = useState({ day: '', month: '', year: '' });
  const [displayLocationName, setDisplayLocationName] = useState(locationName);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [hourlyWeather, setHourlyWeather] = useState<HourlyWeather[]>([]);
  const [dailyWeather, setDailyWeather] = useState<DailyWeather[]>([]);
  const [, setWeatherLoading] = useState(true);
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const fetchLocationName = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}`
        );
        if (!response.ok) throw new Error('Failed to fetch location name');
        const data = await response.json();
        const cityName = data.address.city || data.address.town || data.address.village || data.address.county || data.name || 'Location';
        setDisplayLocationName(cityName);
      } catch (err) {
        console.log('Location name fetch error:', err);
        setDisplayLocationName('Your Location');
      }
    };
    fetchLocationName();
  }, [location]);

  useEffect(() => {
    const fetchPrayerTimes = async () => {
      try {
        setLoading(true);
        const today = new Date();
        const date = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;

        const response = await fetch(
          `https://api.aladhan.com/v1/timings/${date}?latitude=${location.latitude}&longitude=${location.longitude}&method=2`
        );

        if (!response.ok) throw new Error('Failed to fetch prayer times');

        const data: ApiResponse = await response.json();
        const timings = data.data.timings;

        setGregorianDate({
          day: data.data.date.gregorian.day,
          month: data.data.date.gregorian.month,
          year: data.data.date.gregorian.year,
        });
        setHijriDate({
          day: data.data.date.hijri.day,
          month: data.data.date.hijri.month,
          year: data.data.date.hijri.year,
        });

        const prayerList = [
          { name: 'Fajr', time: timings.Fajr },
          { name: 'Sunrise', time: timings.Sunrise },
          { name: 'Dhuhr', time: timings.Dhuhr },
          { name: 'Asr', time: timings.Asr },
          { name: 'Maghrib', time: timings.Maghrib },
          { name: 'Isha', time: timings.Isha },
        ];

        setPrayers(prayerList.map(p => ({
          ...p,
          isActive: false,
          isComing: false,
        })));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch prayer times');
      } finally {
        setLoading(false);
      }
    };

    fetchPrayerTimes();
  }, [location]);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        setWeatherLoading(true);
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,apparent_temperature&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=celsius&forecast_days=10`
        );

        if (!response.ok) throw new Error('Failed to fetch weather');

        const data = await response.json();
        const current = data.current;

        setWeather({
          temperature: Math.round(current.temperature_2m),
          weatherCode: current.weather_code,
          humidity: current.relative_humidity_2m,
          windSpeed: Math.round(current.wind_speed_10m),
          feelsLike: Math.round(current.apparent_temperature),
        });

        // Hourly data - store all hours, filter during render based on current time
        const hourly = data.hourly;

        const hourlyData: HourlyWeather[] = [];
        for (let i = 0; i < hourly.time.length; i++) {
          const timeStr = hourly.time[i];
          const [_, timeOnly] = timeStr.split('T');
          const [hours, minutes] = timeOnly.split(':');
          hourlyData.push({
            time: `${hours}:${minutes}`,
            temperature: Math.round(hourly.temperature_2m[i]),
            weatherCode: hourly.weather_code[i],
          });
        }

        setHourlyWeather(hourlyData);

        // Daily data - next 7 days
        const daily = data.daily;
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dailyData: DailyWeather[] = [];

        for (let i = 0; i < Math.min(10, daily.time.length); i++) {
          const date = new Date(daily.time[i]);
          const dayName = daysOfWeek[date.getDay()];

          dailyData.push({
            day: dayName,
            weatherCode: daily.weather_code[i],
            tempMax: Math.round(daily.temperature_2m_max[i]),
            tempMin: Math.round(daily.temperature_2m_min[i]),
          });
        }

        setDailyWeather(dailyData);
      } catch (err) {
        console.log('Weather fetch error:', err);
      } finally {
        setWeatherLoading(false);
      }
    };

    fetchWeather();
  }, [location]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (prayers.length === 0) return;

    const now = currentTime;
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

    let updatedPrayers = prayers.map(prayer => {
      const [hours, minutes] = prayer.time.split(':').map(Number);
      const prayerTimeInMinutes = hours * 60 + minutes;
      const timeDiff = prayerTimeInMinutes - currentTimeInMinutes;

      return {
        ...prayer,
        isActive: false,
        isComing: timeDiff > 0 && timeDiff <= 120,
      };
    });

    // Find the next upcoming prayer
    const nextPrayer = updatedPrayers.find(p => {
      const [hours, minutes] = p.time.split(':').map(Number);
      const prayerTimeInMinutes = hours * 60 + minutes;
      return prayerTimeInMinutes > currentTimeInMinutes;
    });

    if (nextPrayer) {
      updatedPrayers = updatedPrayers.map(p => ({
        ...p,
        isActive: p.name === nextPrayer.name
      }));
      setNextPrayer(nextPrayer);
    } else {
      setNextPrayer(null);
    }

    setPrayers(updatedPrayers);
  }, [currentTime, prayers.length]);

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-xl text-white">Loading...</p>
        </div>
      </div>
    );
  }

  const hijriMonths = [
    'Muharram', 'Safar', 'Rabi\' al-awwal', 'Rabi\' al-thani',
    'Jumada al-awwal', 'Jumada al-thani', 'Rajab', 'Sha\'ban',
    'Ramadan', 'Shawwal', 'Dhu al-Qi\'dah', 'Dhu al-Hijjah'
  ];

  const gregorianMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const hijriMonthName = hijriMonths[parseInt(hijriDate.month) - 1] || '';
  const gregorianMonthName = gregorianMonths[parseInt(gregorianDate.month) - 1] || '';
  const dayOfWeekName = daysOfWeek[currentTime.getDay()];

  const darkTheme = {
    bg: '#070a12',
    text: '#ffffff',
    muted: '#64748b',
    glassCard: 'rgba(255, 255, 255, 0.02)',
    glassBorder: 'rgba(255, 255, 255, 0.06)',
  };

  const lightTheme = {
    bg: '#f5f5f5',
    text: '#1a1a1a',
    muted: '#7a7a7a',
    glassCard: 'rgba(0, 0, 0, 0.02)',
    glassBorder: 'rgba(0, 0, 0, 0.06)',
  };

  const currentTheme = theme === 'dark' ? darkTheme : lightTheme;
  const tempDisplay = (celsius: number) => getTemperatureDisplay(celsius, tempUnit);

  return (
    <div style={{ backgroundColor: currentTheme.bg, color: currentTheme.text, minHeight: '100vh', position: 'relative', padding: '3rem', overflow: 'hidden' }}>
      {/* Ambient Glows */}
      <div style={{
        position: 'absolute',
        width: '800px',
        height: '800px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(0,0,0,0) 70%)',
        top: '-20%',
        left: '-10%',
        zIndex: 0,
        filter: 'blur(100px)',
      }}></div>
      <div style={{
        position: 'absolute',
        width: '900px',
        height: '900px',
        background: 'radial-gradient(circle, rgba(52, 211, 153, 0.08) 0%, rgba(0,0,0,0) 70%)',
        bottom: '-30%',
        right: '-10%',
        zIndex: 0,
        filter: 'blur(120px)',
      }}></div>

      {/* Dashboard Container */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.9fr 0.5fr',
        gap: 'clamp(1.5rem, 3vw, 2.5rem)',
        zIndex: 1,
        position: 'relative',
        maxWidth: '1600px',
        margin: '0 auto',
        padding: 'clamp(1rem, 3vw, 3rem)',
        width: '100%'
      }}>
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {/* Hero Card */}
          <div style={{
            background: currentTheme.glassCard,
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: `1px solid ${currentTheme.glassBorder}`,
            borderRadius: '32px',
            padding: 'clamp(1.5rem, 5vw, 3rem)',
            boxShadow: theme === 'dark' ? '0 30px 60px -15px rgba(0, 0, 0, 0.6)' : '0 30px 60px -15px rgba(0, 0, 0, 0.1)',
            display: 'grid',
            gridTemplateColumns: 'clamp(1fr, 50vw, 1fr) clamp(1fr, 50vw, 1fr)',
            gridTemplateRows: 'auto auto',
            gap: 'clamp(1rem, 3vw, 2rem)',
            alignItems: 'start'
          }}>
            {/* Clock - Top Left */}
            <div style={{ gridColumn: '1', gridRow: '1' }}>
              <div style={{ fontSize: 'clamp(0.85rem, 2vw, 1.2rem)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.3em', color: currentTheme.muted, marginBottom: 'clamp(0.5rem, 2vw, 1rem)' }}>
                {displayLocationName}
              </div>
              <div style={{ fontFamily: 'Bodoni Moda, serif', fontSize: 'clamp(3.5rem, 12vw, 8.5rem)', fontWeight: 400, lineHeight: 0.9, letterSpacing: '-0.03em' }}>
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                <span style={{ fontSize: 'clamp(1.2rem, 4vw, 2.8rem)', fontFamily: 'Inter, sans-serif', fontWeight: 300, letterSpacing: '0.05em', marginLeft: '0.5rem', color: '#94a3b8' }}>
                  {currentTime.toLocaleTimeString('en-US', { hour12: true }).split(' ')[1]}
                </span>
              </div>
            </div>

            {/* Date Box - Top Right */}
            <div style={{ textAlign: 'right', gridColumn: '2', gridRow: '1' }}>
              <div style={{ fontFamily: 'Bodoni Moda, serif', fontSize: 'clamp(1.5rem, 4vw, 3.2rem)', lineHeight: 1.1, marginBottom: 'clamp(0.4rem, 1vw, 0.75rem)', color: currentTheme.text }}>
                {hijriDate.day} {hijriMonthName}
              </div>
              <div style={{ fontSize: 'clamp(0.85rem, 2vw, 1.2rem)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.2em', color: currentTheme.muted }}>
                {dayOfWeekName}, {gregorianMonthName} {gregorianDate.day}
              </div>
            </div>

            {/* Current Weather - Bottom Right */}
            {weather && (
              <div style={{ gridColumn: '2', gridRow: '2', textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 'clamp(0.4rem, 1vw, 0.75rem)' }}>
                <div style={{ fontFamily: 'Bodoni Moda, serif', lineHeight: 1 }}>
                  <div style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)' }}>
                    {tempDisplay(weather.temperature).temp}<span style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.5rem)', marginLeft: '0.3rem' }}>{tempDisplay(weather.temperature).unit}</span>
                  </div>
                </div>
                <div style={{ fontSize: 'clamp(0.75rem, 1.8vw, 1rem)', color: currentTheme.muted, letterSpacing: '0.02em', lineHeight: 1.4 }}>
                  {getWeatherDescription(weather.weatherCode)}<br/>
                  Feels like <strong style={{ color: currentTheme.text, fontWeight: 500 }}>
                    {tempDisplay(weather.feelsLike).temp}{tempDisplay(weather.feelsLike).unit}
                  </strong>
                </div>
              </div>
            )}
          </div>

          {/* Prayer Times Grid */}
          <div style={{
            background: currentTheme.glassCard,
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: `1px solid ${currentTheme.glassBorder}`,
            borderRadius: '32px',
            padding: 'clamp(2rem, 6vw, 3.5rem)',
            boxShadow: theme === 'dark' ? '0 30px 60px -15px rgba(0, 0, 0, 0.6)' : '0 30px 60px -15px rgba(0, 0, 0, 0.1)',
            minHeight: '361px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.95rem)', fontWeight: 300, textTransform: 'uppercase', letterSpacing: '0.25em', color: currentTheme.muted, marginBottom: 'clamp(2rem, 4vw, 2.5rem)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span>Prayer Times</span>
              {prayers.length > 0 && (() => {
                const timeData = getTimeUntilNextPrayer(currentTime, prayers);
                return (
                  <div style={{ fontSize: 'clamp(0.8rem, 2vw, 0.95rem)', fontFamily: 'Bodoni Moda, serif', fontWeight: 300, color: currentTheme.muted, letterSpacing: '0.03em' }}>
                    {timeData.prayer} ends in <span style={{ fontSize: 'clamp(1.3rem, 3.2vw, 1.7rem)', fontWeight: 400, color: '#fbbf24', textShadow: '0 0 10px rgba(251, 191, 36, 0.3)' }}>
                      {timeData.hours > 0 && <>{timeData.hours}<span style={{ fontSize: '0.65em', marginLeft: '0.1em' }}>h</span> </>}
                      {timeData.mins}<span style={{ fontSize: '0.65em', marginLeft: '0.1em' }}>m</span>
                    </span>
                  </div>
                );
              })()}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'clamp(1rem, 2.5vw, 1.5rem)', flex: 1, alignContent: 'center' }}>
              {prayers.map((prayer) => (
                <div
                  key={prayer.name}
                  style={{
                    background: prayer.isActive ? `linear-gradient(135deg, rgba(52, 211, 153, 0.1) 0%, rgba(52, 211, 153, 0.05) 100%), ${currentTheme.glassCard}` : currentTheme.glassCard,
                    border: prayer.isActive ? '1px solid #34d399' : `1px solid ${currentTheme.glassBorder}`,
                    borderRadius: '20px',
                    padding: '2.75rem 1.5rem',
                    textAlign: 'center',
                    width: prayer.name === 'Sunrise' ? 'auto' : '100%',
                    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                    transform: prayer.isActive && prayer.name !== 'Sunrise' ? 'translateY(-6px) perspective(1200px) rotateX(2deg)' : 'perspective(1200px)',
                    boxShadow: prayer.isActive && prayer.name !== 'Sunrise'
                      ? '0 20px 50px rgba(0, 0, 0, 0.4), 0 10px 20px rgba(52, 211, 153, 0.2), inset 0 1px 2px rgba(255, 255, 255, 0.1)'
                      : '0 10px 30px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.05)',
                    opacity: prayer.name === 'Sunrise' ? 0.6 : 1,
                    maxWidth: prayer.name === 'Sunrise' ? '70%' : 'none',
                    margin: prayer.name === 'Sunrise' ? '0 auto' : '0',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: prayer.name === 'Sunrise' ? '180px' : '200px',
                  }}
                >
                  <div style={{ fontSize: prayer.name === 'Sunrise' ? 'clamp(0.6rem, 1.5vw, 0.75rem)' : 'clamp(0.85rem, 2.3vw, 1.05rem)', textTransform: 'uppercase', letterSpacing: '0.2em', color: prayer.isActive && prayer.name !== 'Sunrise' ? '#34d399' : currentTheme.muted, marginBottom: prayer.name === 'Sunrise' ? 'clamp(0.6rem, 1.5vw, 0.9rem)' : 'clamp(0.8rem, 2vw, 1rem)', fontWeight: 300 }}>
                    {prayer.name}
                  </div>
                  <div style={{ fontFamily: 'Bodoni Moda, serif', fontSize: prayer.name === 'Sunrise' ? 'clamp(0.95rem, 2.5vw, 1.3rem)' : 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 400, color: currentTheme.text, lineHeight: 1 }}>
                    {formatTo12Hour(prayer.time).time}
                    <div style={{ fontSize: prayer.name === 'Sunrise' ? 'clamp(0.55rem, 1vw, 0.7rem)' : 'clamp(0.7rem, 1.6vw, 0.95rem)', color: currentTheme.muted, marginTop: '0.25rem' }}>
                      {formatTo12Hour(prayer.time).period}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - Weather Forecast Strips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(1.5rem, 2vw, 2.5rem)', marginLeft: 'auto', maxWidth: '600px' }}>
          {/* Weather Forecast Strips */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(1rem, 2vw, 1.5rem)', height: 'fit-content' }}>
          {/* LEFT STRIP - Daily Forecast (10-Day) */}
          <div style={{
            background: currentTheme.glassCard,
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: `1px solid ${currentTheme.glassBorder}`,
            borderRadius: '32px',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            boxShadow: theme === 'dark' ? '0 30px 60px -15px rgba(0, 0, 0, 0.6)' : '0 30px 60px -15px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ fontSize: 'clamp(0.65rem, 1.8vw, 0.8rem)', fontWeight: 300, textTransform: 'uppercase', letterSpacing: '0.25em', color: currentTheme.muted, marginBottom: 'clamp(0.75rem, 2vw, 1rem)' }}>
              10-Day
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.8rem, 2vw, 1.2rem)', flex: 1 }}>
              {dailyWeather.slice(0, 10).map((day, index) => (
                <div key={index} style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'clamp(0.3rem, 1vw, 0.5rem)',
                  gap: 'clamp(0.2rem, 1vw, 0.3rem)'
                }}>
                  <span style={{
                    fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
                    fontWeight: 300,
                    letterSpacing: '0.02em',
                    color: currentTheme.text,
                    minWidth: '40px'
                  }}>{day.day}</span>
                  <div style={{ fontSize: 'clamp(2rem, 6vw, 2.4rem)', lineHeight: '1', flex: 0, marginRight: '-0.1rem' }}>
                    {getWeatherIcon(day.weatherCode)}
                  </div>
                  <div style={{ fontSize: 'clamp(0.85rem, 2.2vw, 1.05rem)', fontWeight: 300, letterSpacing: '0.01em', textAlign: 'right', flex: 1 }}>
                    <span style={{ color: currentTheme.text }}>{tempDisplay(day.tempMax).temp}°</span>
                    <span style={{ color: currentTheme.muted, marginLeft: '0.5rem' }}>{tempDisplay(day.tempMin).temp}°</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT STRIP - Hourly Forecast (10-Hour) */}
          <div style={{
            background: currentTheme.glassCard,
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: `1px solid ${currentTheme.glassBorder}`,
            borderRadius: '32px',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            boxShadow: theme === 'dark' ? '0 30px 60px -15px rgba(0, 0, 0, 0.6)' : '0 30px 60px -15px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ fontSize: 'clamp(0.65rem, 1.8vw, 0.8rem)', fontWeight: 300, textTransform: 'uppercase', letterSpacing: '0.25em', color: currentTheme.muted, marginBottom: 'clamp(0.75rem, 2vw, 1rem)' }}>
              Hourly
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.8rem, 2vw, 1.2rem)', flex: 1 }}>
              {hourlyWeather.filter(hour => {
                const forecastHour = parseInt(hour.time.split(':')[0], 10);
                return forecastHour >= currentTime.getHours();
              }).slice(0, 10).map((hour, index) => (
                <div key={index} style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'clamp(0.3rem, 1vw, 0.5rem)',
                  gap: 'clamp(0.2rem, 1vw, 0.3rem)'
                }}>
                  <div style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)', color: currentTheme.muted, minWidth: '40px' }}>
                    {hour.time}
                  </div>
                  <div style={{ fontSize: 'clamp(2rem, 6vw, 2.4rem)', lineHeight: '1', flex: 0, marginRight: '-0.1rem' }}>
                    {getWeatherIcon(hour.weatherCode)}
                  </div>
                  <div style={{ fontFamily: 'Bodoni Moda, serif', fontSize: 'clamp(0.85rem, 2.2vw, 1.05rem)', fontWeight: 300, color: currentTheme.text, textAlign: 'right', flex: 1 }}>
                    {tempDisplay(hour.temperature).temp}{tempDisplay(hour.temperature).unit}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Toggle Controls - Bottom Right Corner */}
      <div style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        display: 'flex',
        gap: '0.5rem',
        zIndex: 100,
      }}>
        {/* Temperature Unit Toggle */}
        <div style={{
          background: currentTheme.glassCard,
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: `1px solid ${currentTheme.glassBorder}`,
          borderRadius: '50px',
          padding: '0.25rem',
          display: 'flex',
          gap: '0.25rem',
        }}>
          <button
            onClick={() => setTempUnit('C')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '50px',
              border: 'none',
              background: tempUnit === 'C' ? '#34d399' : 'transparent',
              color: tempUnit === 'C' ? '#070a12' : currentTheme.text,
              cursor: 'pointer',
              fontWeight: tempUnit === 'C' ? 600 : 400,
              fontSize: '0.7rem',
              transition: 'all 0.3s ease',
            }}
          >
            °C
          </button>
          <button
            onClick={() => setTempUnit('F')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '50px',
              border: 'none',
              background: tempUnit === 'F' ? '#34d399' : 'transparent',
              color: tempUnit === 'F' ? '#070a12' : currentTheme.text,
              cursor: 'pointer',
              fontWeight: tempUnit === 'F' ? 600 : 400,
              fontSize: '0.7rem',
              transition: 'all 0.3s ease',
            }}
          >
            °F
          </button>
        </div>

        {/* Theme Toggle */}
        <div style={{
          background: currentTheme.glassCard,
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: `1px solid ${currentTheme.glassBorder}`,
          borderRadius: '50px',
          padding: '0.25rem',
          display: 'flex',
          gap: '0.25rem',
        }}>
          <button
            onClick={() => setTheme('dark')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '50px',
              border: 'none',
              background: theme === 'dark' ? '#34d399' : 'transparent',
              color: theme === 'dark' ? '#070a12' : currentTheme.text,
              cursor: 'pointer',
              fontWeight: theme === 'dark' ? 600 : 400,
              fontSize: '0.7rem',
              transition: 'all 0.3s ease',
            }}
          >
            🌙
          </button>
          <button
            onClick={() => setTheme('light')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '50px',
              border: 'none',
              background: theme === 'light' ? '#34d399' : 'transparent',
              color: theme === 'light' ? '#070a12' : currentTheme.text,
              cursor: 'pointer',
              fontWeight: theme === 'light' ? 600 : 400,
              fontSize: '0.7rem',
              transition: 'all 0.3s ease',
            }}
          >
            ☀️
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrayerTimes;
