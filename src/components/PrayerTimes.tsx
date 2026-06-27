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
  fullTime: string;
  temperature: number;
  weatherCode: number;
}

interface DailyWeather {
  day: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
}

const getTimeUntilNextPrayer = (currentTime: Date, prayers: Prayer[]): { hours: number; mins: number; secs: number; prayer: string } => {
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

  let timeRemaining = nextPrayerTime - currentTimeInMinutes - 5;
  if (timeRemaining <= 0) {
    timeRemaining += 24 * 60;
  }

  const timeRemainingInSeconds = timeRemaining * 60 + (60 - currentTime.getSeconds());
  const hours = Math.floor(timeRemainingInSeconds / 3600);
  const mins = Math.floor((timeRemainingInSeconds % 3600) / 60);
  const secs = Math.floor(timeRemainingInSeconds % 60);

  return {
    prayer: currentPrayer.name,
    hours: hours,
    mins: mins,
    secs: secs
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
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [lastPlayedPrayer, setLastPlayedPrayer] = useState<string | null>(null);
  const [adhaan, setAdhaan] = useState<HTMLAudioElement | null>(null);
  const [adhaaanEnabled, setAdhaanEnabled] = useState(true);
  const [prayerAdhaanPrefs, setPrayerAdhaanPrefs] = useState<{ [key: string]: boolean }>({
    Fajr: true,
    Dhuhr: true,
    Asr: true,
    Maghrib: true,
    Isha: true,
  });
  const [hadith, setHadith] = useState<{ text: string; reference: string } | null>(null);

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
            fullTime: timeStr,
            temperature: Math.round(hourly.temperature_2m[i]),
            weatherCode: hourly.weather_code[i],
          });
        }

        setHourlyWeather(hourlyData);

        // Daily data - next 7 days
        const daily = data.daily;
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dailyData: DailyWeather[] = [];

        for (let i = 1; i < Math.min(6, daily.time.length); i++) {
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
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const audio = new Audio('https://cdn.jsdelivr.net/npm/adhaan-audio@1.0.0/adhaan.mp3');
    setAdhaan(audio);

    const savedPrefs = localStorage.getItem('prayerAdhaanPrefs');
    if (savedPrefs) {
      setPrayerAdhaanPrefs(JSON.parse(savedPrefs));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('prayerAdhaanPrefs', JSON.stringify(prayerAdhaanPrefs));
  }, [prayerAdhaanPrefs]);

  useEffect(() => {
    const fetchHadith = async () => {
      try {
        const hadiths = [
          { text: "The best of you are those who are best to their families, and I am the best among you to my family.", reference: "Tirmidhi" },
          { text: "Verily, Allah loves those who are patient.", reference: "Quran 3:146" },
          { text: "The greatest jihad is a struggle against your own self.", reference: "Hadith" },
          { text: "Knowledge is that which benefits, not that which is memorized.", reference: "Hadith" },
          { text: "Wealth and children are adornments of life, but the everlasting good deeds are better.", reference: "Quran 18:46" },
          { text: "The best charity is that given when one is in need yet gives.", reference: "Hadith" },
          { text: "Do not belittle any good deed, no matter how small it may seem.", reference: "Muslim" },
          { text: "Paradise is under the feet of your mothers.", reference: "Hadith" },
          { text: "Cleanliness is half of faith.", reference: "Muslim" },
          { text: "The truthful merchant will be with the prophets on the Day of Judgment.", reference: "Tirmidhi" },
        ];

        const randomHadith = hadiths[Math.floor(Math.random() * hadiths.length)];
        setHadith(randomHadith);
      } catch (err) {
        console.log('Hadith fetch error:', err);
      }
    };

    fetchHadith();
  }, []);

  useEffect(() => {
    if (prayers.length === 0 || !adhaan || !adhaaanEnabled) return;

    const now = currentTime;
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

    for (const prayer of prayers) {
      if (prayer.name === 'Sunrise') continue;

      const [hours, minutes] = prayer.time.split(':').map(Number);
      const prayerTimeInMinutes = hours * 60 + minutes;
      const timeDiff = Math.abs(prayerTimeInMinutes - currentTimeInMinutes);

      if (timeDiff <= 1 && lastPlayedPrayer !== prayer.name && prayerAdhaanPrefs[prayer.name]) {
        setLastPlayedPrayer(prayer.name);
        adhaan.currentTime = 0;
        adhaan.play().catch(err => console.log('Adhaan play error:', err));
        break;
      }
    }
  }, [currentTime, prayers, adhaan, adhaaanEnabled, lastPlayedPrayer, prayerAdhaanPrefs]);

  useEffect(() => {
    if (prayers.length === 0) return;

    const now = currentTime;
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

    // Find current prayer (prayer_time <= current_time) and next prayer (prayer_time > current_time)
    let currentPrayerObj = null;
    let nextPrayerObj = null;

    for (let i = 0; i < prayers.length; i++) {
      const prayer = prayers[i];
      const [hours, minutes] = prayer.time.split(':').map(Number);
      const prayerTimeInMinutes = hours * 60 + minutes;

      if (prayerTimeInMinutes <= currentTimeInMinutes) {
        currentPrayerObj = prayer;
      } else if (!nextPrayerObj) {
        nextPrayerObj = prayer;
      }
    }

    let updatedPrayers = prayers.map(prayer => {
      const [hours, minutes] = prayer.time.split(':').map(Number);
      const prayerTimeInMinutes = hours * 60 + minutes;
      const timeDiff = prayerTimeInMinutes - currentTimeInMinutes;

      return {
        ...prayer,
        isActive: currentPrayerObj ? prayer.name === currentPrayerObj.name : false,
        isNext: nextPrayerObj ? prayer.name === nextPrayerObj.name : false,
        isUpcoming: timeDiff > 0,
        isComing: timeDiff > 0 && timeDiff <= 120,
        isPast: timeDiff < 0,
      };
    });

    setPrayers(updatedPrayers);
    setNextPrayer(nextPrayerObj || null);
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

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth < 1024;
  const prayerColumns = isMobile ? 2 : isTablet ? 3 : 6;

  return (
    <div style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }} className="min-h-screen relative overflow-hidden px-2 sm:px-4 lg:px-6 pt-3 sm:pt-4 lg:pt-6 pb-4 sm:pb-12">
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 relative z-10 max-w-7xl mx-auto w-full auto-rows-max">
        {/* Prayer Times Grid - Full Width */}
        <div style={{ background: currentTheme.glassCard, border: `1px solid ${currentTheme.glassBorder}`, boxShadow: theme === 'dark' ? '0 30px 60px -15px rgba(0, 0, 0, 0.6)' : '0 30px 60px -15px rgba(0, 0, 0, 0.1)' }} className="col-span-1 lg:col-span-12 backdrop-blur-lg rounded-3xl p-3 sm:p-4 lg:p-6 min-h-fit lg:min-h-60 flex flex-col">
            <div className="text-base sm:text-lg lg:text-xl font-light uppercase tracking-widest mb-3 sm:mb-4 lg:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
              <div>
                <div style={{ color: currentTheme.muted }} className="text-xs sm:text-sm lg:text-base font-medium uppercase tracking-widest mb-2 sm:mb-3">
                  {displayLocationName}
                </div>
                <div className="flex items-baseline gap-2">
                  <div style={{ fontFamily: 'Bodoni Moda, serif', color: currentTheme.text }} className="text-6xl sm:text-8xl lg:text-9xl font-light leading-tight tracking-tight">
                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).split(' ')[0]}
                  </div>
                  <div style={{ color: currentTheme.muted, fontFamily: 'Bodoni Moda, serif' }} className="text-lg sm:text-2xl lg:text-3xl font-light">
                    {currentTime.toLocaleTimeString('en-US', { hour12: true }).split(' ')[1]}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div style={{ fontFamily: 'Bodoni Moda, serif', color: currentTheme.text }} className="text-lg sm:text-2xl lg:text-3xl leading-tight mb-1 sm:mb-2">
                  {hijriMonthName} {hijriDate.day}
                </div>
                <div style={{ color: currentTheme.muted }} className="text-xs sm:text-sm lg:text-base font-medium uppercase tracking-wide">
                  Hijri {hijriDate.year}
                </div>
              </div>
            </div>
            <div style={{ gridTemplateColumns: `repeat(${prayerColumns}, 1fr)` }} className="grid gap-2 sm:gap-4 lg:gap-6 flex-1 auto-rows-fr w-full">
              {prayers.map((prayer, index) => {
                // Calculate prayer duration
                let durationMins = 0;
                if (index < prayers.length - 1) {
                  const [currentHours, currentMins] = prayer.time.split(':').map(Number);
                  const [nextHours, nextMins] = prayers[index + 1].time.split(':').map(Number);
                  const currentTotalMins = currentHours * 60 + currentMins;
                  const nextTotalMins = nextHours * 60 + nextMins;
                  durationMins = nextTotalMins > currentTotalMins ? nextTotalMins - currentTotalMins : (24 * 60) - currentTotalMins + nextTotalMins;
                }

                return prayer.name === 'Sunrise' ? null : (
                <div
                  key={prayer.name}
                  style={{
                    background: prayer.isActive
                      ? `linear-gradient(135deg, rgba(52, 211, 153, 0.15) 0%, rgba(52, 211, 153, 0.08) 100%), ${currentTheme.glassCard}`
                      : prayer.isComing
                      ? `linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%), ${currentTheme.glassCard}`
                      : `linear-gradient(135deg, rgba(148, 163, 184, 0.05) 0%, rgba(148, 163, 184, 0.02) 100%), ${currentTheme.glassCard}`,
                    border: prayer.isActive
                      ? '1px solid #34d399'
                      : prayer.isComing
                      ? '1px solid #3b82f6'
                      : `1px solid ${currentTheme.glassBorder}`,
                    boxShadow: prayer.isActive
                      ? '0 25px 60px rgba(52, 211, 153, 0.3), 0 15px 35px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.1)'
                      : prayer.isComing
                      ? '0 15px 40px rgba(59, 130, 246, 0.2), 0 10px 25px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.05)'
                      : '0 10px 30px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.05)',
                    transform: prayer.isActive ? 'translateY(-6px) scale(1.08) perspective(1200px) rotateX(2deg)' : 'perspective(1200px)',
                  }}
                  className="rounded-lg sm:rounded-2xl p-2 sm:p-3 lg:p-4 text-center relative flex flex-col justify-center items-center min-h-28 sm:min-h-32 lg:min-h-40 transition-all duration-300 ease-out"
                >
                  {/* Adhaan Mute Toggle Button */}
                  <button
                    onClick={() => setPrayerAdhaanPrefs(prev => ({ ...prev, [prayer.name]: !prev[prayer.name] }))}
                    style={{
                      color: prayerAdhaanPrefs[prayer.name] ? '#34d399' : '#ef4444',
                    }}
                    className="absolute bottom-2 right-2 sm:bottom-2.5 sm:right-2.5 lg:bottom-3 lg:right-3 p-0 transition-all duration-200 text-xs sm:text-sm hover:scale-110"
                    title={prayerAdhaanPrefs[prayer.name] ? 'Adhaan enabled' : 'Adhaan muted'}
                  >
                    {prayerAdhaanPrefs[prayer.name] ? '🔊' : '🔇'}
                  </button>
                  <div style={{
                    color: prayer.isActive
                      ? '#34d399'
                      : prayer.isComing
                      ? '#3b82f6'
                      : '#94a3b8'
                  }} className="text-xs sm:text-sm lg:text-base uppercase tracking-widest font-light mb-1 sm:mb-2">
                    {prayer.name}
                  </div>
                  <div style={{
                    fontFamily: 'Bodoni Moda, serif',
                    color: prayer.isActive
                      ? '#34d399'
                      : prayer.isComing
                      ? '#3b82f6'
                      : '#94a3b8'
                  }} className="text-2xl sm:text-4xl lg:text-6xl font-light leading-tight">
                    {formatTo12Hour(prayer.time).time}
                    <div style={{ color: prayer.isActive ? '#34d399' : prayer.isComing ? '#3b82f6' : currentTheme.muted }} className="text-xs sm:text-sm lg:text-base font-light mt-0.5">
                      {formatTo12Hour(prayer.time).period}
                    </div>
                  </div>
                  <div style={{ color: currentTheme.muted }} className="text-xs sm:text-sm lg:text-base font-light mt-2 sm:mt-3">
                    {durationMins > 0 ? `${Math.floor(durationMins / 60) > 0 ? `${Math.floor(durationMins / 60)}h ` : ''}${durationMins % 60}m` : prayer.name === 'Isha' ? 'Till Tahajjud' : 'Last prayer'}
                  </div>
                  </div>
                );
              })}

              {/* Countdown Section */}
              {prayers.length > 0 && (() => {
                const timeData = getTimeUntilNextPrayer(currentTime, prayers);
                const displayText = timeData.prayer === 'Sunrise' ? 'Dhuhr starts in' : `${timeData.prayer} ends in`;
                return (
                  <div
                    style={{
                      background: `linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%), ${currentTheme.glassCard}`,
                      border: '1px solid #06b6d4',
                      boxShadow: '0 15px 40px rgba(6, 182, 212, 0.2), 0 10px 25px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.05)',
                    }}
                    className="rounded-lg sm:rounded-2xl p-2 sm:p-3 lg:p-4 text-center flex flex-col justify-center items-center min-h-28 sm:min-h-32 lg:min-h-40 transition-all duration-300 ease-out"
                  >
                    <div style={{ color: '#06b6d4' }} className="text-xs sm:text-sm lg:text-base uppercase tracking-widest font-light mb-2 sm:mb-3">
                      {displayText}
                    </div>
                    <div style={{
                      fontFamily: 'Bodoni Moda, serif',
                      color: '#06b6d4',
                      textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
                    }} className="text-2xl sm:text-4xl lg:text-6xl font-light leading-tight">
                      {timeData.hours > 0 && <>{timeData.hours}<span className="text-sm sm:text-base lg:text-lg ml-1">h</span> </>}
                      {timeData.mins > 0 && <>{timeData.mins.toString().padStart(2, '0')}<span className="text-sm sm:text-base lg:text-lg ml-1">m</span> </>}
                      {timeData.secs.toString().padStart(2, '0')}<span className="text-sm sm:text-base lg:text-lg ml-1">s</span>
                    </div>
                  </div>
                );
              })()}

            </div>

            {/* Hadith of the Day */}
            {hadith && (
              <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-opacity-20" style={{ borderColor: currentTheme.glassBorder }}>
                <div style={{ color: currentTheme.muted }} className="text-sm sm:text-base lg:text-lg font-light uppercase tracking-widest mb-3 sm:mb-4">
                  Hadith of the Day
                </div>
                <div style={{ color: currentTheme.text }} className="text-base sm:text-lg lg:text-2xl font-light leading-relaxed mb-3 sm:mb-4">
                  {hadith.text}
                </div>
                <div style={{ color: currentTheme.muted }} className="text-sm sm:text-base lg:text-lg font-light">
                  — {hadith.reference}
                </div>
              </div>
            )}
        </div>

        {/* LEFT COLUMN */}
        <div className="col-span-1 lg:col-span-10 row-span-1 flex flex-col gap-3 sm:gap-4 lg:gap-5">
          {/* Hero Card */}
          <div style={{ background: currentTheme.glassCard, border: `1px solid ${currentTheme.glassBorder}`, boxShadow: theme === 'dark' ? '0 30px 60px -15px rgba(0, 0, 0, 0.6)' : '0 30px 60px -15px rgba(0, 0, 0, 0.1)' }} className="backdrop-blur-lg rounded-3xl p-3 sm:p-4 lg:p-6 flex flex-col gap-8 sm:gap-12 lg:gap-16">
            {/* Top Row: Weather and Date */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
              {/* Current Weather - Top Left */}
              {weather && (
                <div className="flex-shrink-0 text-left flex flex-col justify-start gap-2">
                  <div className="flex items-start gap-2">
                    <div style={{ fontFamily: 'Bodoni Moda, serif' }} className="leading-tight">
                      <div style={{ color: currentTheme.text }} className="text-2xl sm:text-4xl lg:text-5xl font-light whitespace-nowrap">
                        {tempUnit === 'C' ? (
                          <>
                            {tempDisplay(weather.temperature).temp}<span className="text-lg sm:text-2xl lg:text-3xl font-light ml-0.5">°C</span>
                            <span style={{ color: currentTheme.muted }} className="text-lg sm:text-2xl lg:text-3xl font-light ml-1">/</span>
                            <span className="text-lg sm:text-2xl lg:text-3xl font-light ml-1">{celsiusToFahrenheit(weather.temperature)}°F</span>
                          </>
                        ) : (
                          <>
                            {tempDisplay(weather.temperature).temp}<span className="text-lg sm:text-2xl lg:text-3xl font-light ml-0.5">°F</span>
                            <span style={{ color: currentTheme.muted }} className="text-lg sm:text-2xl lg:text-3xl font-light ml-1">/</span>
                            <span className="text-lg sm:text-2xl lg:text-3xl font-light ml-1">{weather.temperature}°C</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-4xl sm:text-5xl lg:text-6xl leading-none">
                      {getWeatherIcon(weather.weatherCode)}
                    </div>
                  </div>
                  <div style={{ color: currentTheme.muted }} className="text-sm sm:text-base lg:text-lg tracking-tight leading-tight">
                    <div style={{ color: currentTheme.text }} className="font-medium text-sm sm:text-base lg:text-lg">
                      {getWeatherDescription(weather.weatherCode)}
                    </div>
                    <div className="text-sm sm:text-base lg:text-lg">
                      Feels like <strong style={{ color: currentTheme.text }} className="font-medium">
                        {tempDisplay(weather.feelsLike).temp}°
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Date Box - Top Right */}
              <div className="text-right">
                <div style={{ fontFamily: 'Bodoni Moda, serif', color: currentTheme.text }} className="text-2xl sm:text-3xl lg:text-4xl leading-tight mb-1 sm:mb-2">
                  {gregorianMonthName} {gregorianDate.day}
                </div>
                <div style={{ color: currentTheme.muted }} className="text-sm sm:text-base lg:text-lg font-medium uppercase tracking-wide">
                  {dayOfWeekName} {gregorianDate.year}
                </div>
                <div style={{ color: currentTheme.muted }} className="text-xs sm:text-sm lg:text-base font-medium uppercase tracking-widest mt-2 sm:mt-3">
                  {displayLocationName}
                </div>
              </div>
            </div>

            {/* Bottom Row: Hourly Forecast */}
            {hourlyWeather.length > 0 && (
              <div className="flex-1">
                <div className="flex flex-row gap-2 overflow-x-auto pb-1">
                  {hourlyWeather.filter(hour => {
                    const forecastDateTime = new Date(hour.fullTime);
                    return forecastDateTime > currentTime;
                  }).slice(0, 15).map((hour, index) => (
                    <div key={index} className="flex flex-col items-center gap-0.5 text-center flex-shrink-0">
                      <div style={{ color: currentTheme.muted }} className="text-sm sm:text-base lg:text-lg font-light">
                        {formatTo12Hour(hour.time).time}
                      </div>
                      <div className="text-2xl sm:text-3xl lg:text-4xl leading-tight">
                        {getWeatherIcon(hour.weatherCode)}
                      </div>
                      <div style={{ color: currentTheme.text }} className="text-sm sm:text-base lg:text-lg font-medium">
                        {tempDisplay(hour.temperature).temp}°
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - Weather Forecast Strips */}
        <div className="col-span-1 lg:col-span-2 row-span-1">
          {/* Daily Forecast (5-Day) */}
          <div style={{ background: currentTheme.glassCard, border: `1px solid ${currentTheme.glassBorder}`, boxShadow: theme === 'dark' ? '0 30px 60px -15px rgba(0, 0, 0, 0.6)' : '0 30px 60px -15px rgba(0, 0, 0, 0.1)' }} className="backdrop-blur-lg rounded-3xl p-3 sm:p-4 lg:p-6 h-full flex flex-col">
            <div style={{ color: currentTheme.muted }} className="text-sm sm:text-base lg:text-lg font-light uppercase tracking-widest mb-2 sm:mb-3 lg:mb-4">
              5-Day
            </div>
            <div className="flex flex-col gap-2 sm:gap-2.5 lg:gap-3 flex-1 justify-between">
              {dailyWeather.slice(0, 5).map((day, index) => (
                <div key={index} className="flex flex-row items-center justify-between gap-1.5 sm:gap-2 flex-shrink-0">
                  <span style={{ color: currentTheme.text }} className="text-sm sm:text-base lg:text-lg font-light tracking-wide min-w-fit">{day.day}</span>
                  <div className="text-2xl sm:text-3xl lg:text-4xl leading-tight flex-shrink-0">
                    {getWeatherIcon(day.weatherCode)}
                  </div>
                  <div style={{ color: currentTheme.text }} className="text-sm sm:text-base lg:text-lg font-light tracking-tight text-right flex-1">
                    <span>{tempDisplay(day.tempMax).temp}°</span>
                    <span style={{ color: currentTheme.muted }} className="ml-0.5 sm:ml-1">{tempDisplay(day.tempMin).temp}°</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Controls - Bottom Right Corner */}
      <div className="fixed bottom-2 sm:bottom-3 right-2 sm:right-3 flex flex-col sm:flex-row gap-1 sm:gap-2 z-50">
        {/* Adhaan Sound Toggle */}
        <div style={{ background: currentTheme.glassCard, border: `1px solid ${currentTheme.glassBorder}` }} className="backdrop-blur-lg rounded-full p-1 flex gap-1">
          <button
            onClick={() => setAdhaanEnabled(!adhaaanEnabled)}
            style={{
              background: adhaaanEnabled ? '#34d399' : 'transparent',
              color: adhaaanEnabled ? '#070a12' : currentTheme.text,
            }}
            className="px-2 sm:px-3 py-1 rounded-full border-none cursor-pointer text-xs sm:text-sm transition-all duration-300 ease-out"
            title="Toggle Adhaan sound"
          >
            {adhaaanEnabled ? '🔊' : '🔇'}
          </button>
        </div>

        {/* Temperature Unit Toggle */}
        <div style={{ background: currentTheme.glassCard, border: `1px solid ${currentTheme.glassBorder}` }} className="backdrop-blur-lg rounded-full p-1 flex gap-1">
          <button
            onClick={() => setTempUnit('C')}
            style={{
              background: tempUnit === 'C' ? '#34d399' : 'transparent',
              color: tempUnit === 'C' ? '#070a12' : currentTheme.text,
            }}
            className="px-2 sm:px-3 py-1 rounded-full border-none cursor-pointer text-xs sm:text-sm font-medium transition-all duration-300 ease-out"
          >
            °C
          </button>
          <button
            onClick={() => setTempUnit('F')}
            style={{
              background: tempUnit === 'F' ? '#34d399' : 'transparent',
              color: tempUnit === 'F' ? '#070a12' : currentTheme.text,
            }}
            className="px-2 sm:px-3 py-1 rounded-full border-none cursor-pointer text-xs sm:text-sm font-medium transition-all duration-300 ease-out"
          >
            °F
          </button>
        </div>

        {/* Theme Toggle */}
        <div style={{ background: currentTheme.glassCard, border: `1px solid ${currentTheme.glassBorder}` }} className="backdrop-blur-lg rounded-full p-1 flex gap-1">
          <button
            onClick={() => setTheme('dark')}
            style={{
              background: theme === 'dark' ? '#34d399' : 'transparent',
              color: theme === 'dark' ? '#070a12' : currentTheme.text,
            }}
            className="px-2 sm:px-3 py-1 rounded-full border-none cursor-pointer text-xs sm:text-sm transition-all duration-300 ease-out"
          >
            🌙
          </button>
          <button
            onClick={() => setTheme('light')}
            style={{
              background: theme === 'light' ? '#34d399' : 'transparent',
              color: theme === 'light' ? '#070a12' : currentTheme.text,
            }}
            className="px-2 sm:px-3 py-1 rounded-full border-none cursor-pointer text-xs sm:text-sm transition-all duration-300 ease-out"
          >
            ☀️
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrayerTimes;
