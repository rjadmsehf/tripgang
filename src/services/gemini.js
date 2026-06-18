import { GoogleGenerativeAI } from '@google/generative-ai';

export async function parseReceiptWithGemini(apiKey, base64Image) {
  if (!apiKey) {
    throw new Error('Gemini API Key가 필요합니다.');
  }
  if (!base64Image) {
    throw new Error('분석할 이미지 파일이 필요합니다.');
  }

  // GoogleGenerativeAI 초기화
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // 3.5버전 플래시 모델 연동
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); // SDK에서 호환 가능한 최신 stable 혹은 preview 모델명

  // 이미지를 Gemini에 전달할 파트 포맷으로 가공
  const imagePart = {
    inlineData: {
      data: base64Image.split(',')[1] || base64Image, // data:image/png;base64,... 프리픽스 제거
      mimeType: 'image/jpeg'
    }
  };

  const systemInstruction = `
  You are an expert receipt OCR analyzer. Your task is to extract the store/shop name, item names, prices, total amount, and currency from receipt images.
  For the "storeName" field, extract the name of the store (e.g., "FamilyMart", "Starbucks") and translate it to Korean if applicable (e.g. "패밀리마트", "스타벅스"). If the store name cannot be found, provide a generic description based on the receipt content.
  Translate the extracted item names into Korean for the "translatedName" field.
  Provide the output in a strict JSON format matching the schema below. Do not include any markdown wrapper like \`\`\`json. Return only the raw JSON string.

  JSON Schema:
  {
    "storeName": "Name of the store",
    "currency": "USD" | "JPY" | "CNY" | "EUR" | "KRW",
    "totalAmount": number,
    "items": [
      {
        "name": "Original menu item name",
        "translatedName": "Korean translated name",
        "price": number
      }
    ]
  }
  `;

  try {
    const result = await model.generateContent([
      systemInstruction,
      imagePart
    ]);
    const response = await result.response;
    const text = response.text().trim();
    // 혹시라도 LLM이 마크다운 블록을 제공할 경우를 대비하여 정제
    const jsonCleaned = text.replace(/^```json/, '').replace(/```$/, '').trim();
    return JSON.parse(jsonCleaned);
  } catch (error) {
    console.error(error);
    throw new Error('영수증 분석 중 오류가 발생했습니다: ' + error.message);
  }
}
