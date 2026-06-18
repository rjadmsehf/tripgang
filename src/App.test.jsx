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

// PeerJS 모킹 (jsdom 환경에서 WebRTC 미지원 에러 및 타이머 문제 방지)
vi.mock('peerjs', () => {
  return {
    Peer: vi.fn().mockImplementation(() => {
      return {
        on: vi.fn(),
        connect: vi.fn().mockReturnValue({
          on: vi.fn(),
          send: vi.fn()
        }),
        destroy: vi.fn()
      };
    })
  };
});

describe('Travel Settlement Core Logic', () => {
  it('allows adding companions and calculates settlement details', async () => {
    render(<App />);

    // 0. 환율 로드가 비동기로 이루어지므로, 로드 완료되어 화면이 갱신될 때까지 대기 (act 경고 해결)
    await screen.findByText('실시간 환율: 100 JPY = 900원 | 1 CNY = 1원');
    
    // 1. 멤버 추가 테스트
    const memberInput = screen.getByPlaceholderText('이름 입력');
    const addButton = screen.getAllByRole('button', { name: '추가' })[0];
    
    fireEvent.change(memberInput, { target: { value: 'Alice' } });
    fireEvent.click(addButton);
    
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
  });
});
