import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRates, convertToKrw } from './exchangeRate';

describe('Exchange Rate Service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should convert JPY to KRW correctly', () => {
    const rates = { JPY: 150.0, KRW: 1350.0, USD: 1.0 };
    // 100 JPY -> USD: 100 / 150 = 0.666 USD -> KRW: 0.666 * 1350 = 900 KRW
    const converted = convertToKrw(100, 'JPY', rates);
    expect(converted).toBe(900);
  });

  it('should fallback to default rates on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const rates = await fetchRates();
    expect(rates).toHaveProperty('KRW');
    expect(rates.KRW).toBe(1350.0);
  });
});
