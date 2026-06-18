const CACHE_KEY = 'travel_rates_cache';
const CACHE_DURATION = 60 * 60 * 1000; // 1시간 (밀리초)

export async function fetchRates() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const { timestamp, rates } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_DURATION) {
      return rates;
    }
  }

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) throw new Error('환율 정보를 가져오지 못했습니다.');
    const data = await response.json();
    
    const rates = data.rates;
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      rates
    }));
    return rates;
  } catch (error) {
    console.error(error);
    // API 장애 시 폴백 기본값 반환 (2026 기준 대략적 환율)
    return {
      USD: 1.0,
      KRW: 1350.0,
      JPY: 150.0, // 1 USD = 150 JPY
      CNY: 7.2    // 1 USD = 7.2 CNY
    };
  }
}

export function convertToKrw(amount, fromCurrency, rates) {
  if (!rates || !rates[fromCurrency] || !rates['KRW']) return amount;
  if (fromCurrency === 'KRW') return amount;
  // USD 기준 비율 환산
  const amountInUsd = amount / rates[fromCurrency];
  return Math.round(amountInUsd * rates['KRW']);
}
