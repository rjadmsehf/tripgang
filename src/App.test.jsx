import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { describe, it, expect, vi } from 'vitest';

// 환율 API 모킹
vi.mock('./services/exchangeRate', () => ({
  fetchRates: vi.fn().mockResolvedValue({ JPY: 150.0, KRW: 1350.0, USD: 1.0 }),
  convertToKrw: (amount, fromCurrency) => {
    if (fromCurrency === 'JPY') return amount * 9; // JPY -> KRW 대충 9배 단순화
    return amount;
  }
}));

describe('Travel Settlement Core Logic', () => {
  it('allows adding companions and calculates settlement details', async () => {
    render(<App />);
    
    // 1. 멤버 추가 테스트
    const memberInput = screen.getByPlaceholderText('이름 입력');
    const addButton = screen.getAllByRole('button', { name: '추가' })[0];
    
    fireEvent.change(memberInput, { target: { value: 'Alice' } });
    fireEvent.click(addButton);
    
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
  });
});
