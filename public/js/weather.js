// Weather Widget - Fetches from Deno backend

document.addEventListener('DOMContentLoaded', () => {
    const weatherTemp = document.getElementById('weather-temp');

    async function fetchWeather() {
        try {
            const response = await fetch('/api/weather');

            if (!response.ok) {
                throw new Error('Weather fetch failed');
            }

            const data = await response.json();

            if (weatherTemp && data.temperature) {
                weatherTemp.textContent = `${data.temperature}°`;

                // Add pulsing animation on update
                weatherTemp.style.animation = 'none';
                setTimeout(() => {
                    weatherTemp.style.animation = 'pulse-temp 0.5s ease';
                }, 10);
            }

        } catch (error) {
            console.error('Weather fetch error:', error);
            if (weatherTemp) {
                weatherTemp.textContent = '--°';
            }
        }
    }

    // Fetch weather immediately and every 30 minutes
    fetchWeather();
    setInterval(fetchWeather, 1800000);
});
