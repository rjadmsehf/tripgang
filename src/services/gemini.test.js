import { describe, it, expect, vi } from 'vitest';
import { parseReceiptWithGemini } from './gemini';

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => {
      return {
        getGenerativeModel: vi.fn().mockImplementation(() => {
          return {
            generateContent: vi.fn().mockResolvedValue({
              response: {
                text: vi.fn().mockReturnValue(`
                {
                  "storeName": "이치란 라멘",
                  "currency": "JPY",
                  "totalAmount": 1900,
                  "items": [
                    {
                      "name": "ラーメン",
                      "translatedName": "라멘",
                      "price": 950
                    },
                    {
                      "name": "餃子",
                      "translatedName": "만두",
                      "price": 950
                    }
                  ]
                }
                `)
              }
            })
          };
        })
      };
    })
  };
});

describe('Gemini Receipt Parser', () => {
  it('should reject when API key is missing', async () => {
    await expect(parseReceiptWithGemini('', 'base64str')).rejects.toThrow('Gemini API Key가 필요합니다.');
  });

  it('should successfully parse and return mock receipt', async () => {
    const result = await parseReceiptWithGemini('mock-key', 'data:image/jpeg;base64,mockbase64');
    expect(result.currency).toBe('JPY');
    expect(result.totalAmount).toBe(1900);
    expect(result.items[0].translatedName).toBe('라멘');
  });
});
