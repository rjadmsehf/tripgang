import React, { useState, useEffect } from 'react';
import { fetchRates, convertToKrw } from './services/exchangeRate';
import { parseReceiptWithGemini } from './services/gemini';
import './App.css';

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [members, setMembers] = useState([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [rates, setRates] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 환율 로드
  useEffect(() => {
    fetchRates().then(setRates);
  }, []);

  // API Key 저장
  const handleSaveApiKey = (e) => {
    const val = e.target.value;
    setApiKey(val);
    localStorage.setItem('gemini_api_key', val);
  };

  // 멤버 추가
  const handleAddMember = (e) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    if (members.includes(newMemberName.trim())) {
      setError('이미 존재하는 동행자입니다.');
      return;
    }
    setMembers([...members, newMemberName.trim()]);
    setNewMemberName('');
    setError('');
  };

  // 멤버 삭제
  const handleRemoveMember = (name) => {
    setMembers(members.filter(m => m !== name));
    // 해당 멤버의 할당 정보도 삭제해야 함
    const updatedReceipts = receipts.map(receipt => {
      const updatedAssignments = { ...receipt.assignments };
      Object.keys(updatedAssignments).forEach(itemId => {
        updatedAssignments[itemId] = updatedAssignments[itemId].filter(m => m !== name);
      });
      return { ...receipt, assignments: updatedAssignments };
    });
    setReceipts(updatedReceipts);
  };

  // 영수증 업로드 및 파싱
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!apiKey) {
      setError('영수증 분석을 위해 Gemini API Key를 먼저 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setError('');

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result;
        const parsed = await parseReceiptWithGemini(apiKey, base64);
        
        // 영수증 구조화 추가
        const newReceipt = {
          id: Date.now(),
          name: file.name,
          currency: parsed.currency || 'KRW',
          totalAmount: parsed.totalAmount || 0,
          items: (parsed.items || []).map((item, idx) => ({
            id: `${Date.now()}-${idx}`,
            name: item.name,
            translatedName: item.translatedName || item.name,
            price: item.price || 0
          })),
          assignments: {} // itemId -> Array of memberNames
        };

        // 초기화 시 모든 아이템에 대해 배분자 없음
        newReceipt.items.forEach(item => {
          newReceipt.assignments[item.id] = [];
        });

        setReceipts([...receipts, newReceipt]);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 아이템 체크박스 토글 (멤버 지정/해제)
  const toggleAssignment = (receiptId, itemId, memberName) => {
    setReceipts(receipts.map(r => {
      if (r.id !== receiptId) return r;
      const currentAssignees = r.assignments[itemId] || [];
      const updatedAssignees = currentAssignees.includes(memberName)
        ? currentAssignees.filter(m => m !== memberName)
        : [...currentAssignees, memberName];
      return {
        ...r,
        assignments: {
          ...r.assignments,
          [itemId]: updatedAssignees
        }
      };
    }));
  };

  // 수동 아이템 추가 기능
  const handleAddManualItem = (receiptId) => {
    setReceipts(receipts.map(r => {
      if (r.id !== receiptId) return r;
      const newItem = {
        id: `manual-${Date.now()}`,
        name: '수동 추가 항목',
        translatedName: '수동 추가 항목',
        price: 0
      };
      return {
        ...r,
        items: [...r.items, newItem],
        assignments: {
          ...r.assignments,
          [newItem.id]: []
        }
      };
    }));
  };

  // 메뉴 가격 수정 지원
  const handleUpdateItemPrice = (receiptId, itemId, field, value) => {
    setReceipts(receipts.map(r => {
      if (r.id !== receiptId) return r;
      const updatedItems = r.items.map(item => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          [field]: field === 'price' ? parseFloat(value) || 0 : value
        };
      });
      return { ...r, items: updatedItems };
    }));
  };

  // 최종 정산 계산기 (멤버별 누적 합계)
  const calculateMemberBalances = () => {
    const balances = {};
    members.forEach(m => {
      balances[m] = {
        foreignTotal: 0,
        krwTotal: 0,
        itemsBreakdown: []
      };
    });

    receipts.forEach(receipt => {
      receipt.items.forEach(item => {
        const assignees = receipt.assignments[item.id] || [];
        if (assignees.length === 0) return; // 미배분 아이템은 패스
        
        const splitPrice = item.price / assignees.length;
        const splitPriceKrw = rates ? convertToKrw(splitPrice, receipt.currency, rates) : splitPrice;

        assignees.forEach(member => {
          if (balances[member]) {
            balances[member].foreignTotal += splitPrice;
            balances[member].krwTotal += splitPriceKrw;
            balances[member].itemsBreakdown.push({
              receiptName: receipt.name,
              itemName: item.translatedName,
              originalPrice: item.price,
              currency: receipt.currency,
              sharePrice: splitPrice,
              sharePriceKrw: splitPriceKrw,
              splitCount: assignees.length
            });
          }
        });
      });
    });

    return balances;
  };

  const memberBalances = calculateMemberBalances();

  return (
    <div className="app-container">
      <h1>여행 정산 관리</h1>
      <div className="api-config">
        <input 
          type="password" 
          placeholder="Gemini API Key" 
          value={apiKey} 
          onChange={handleSaveApiKey} 
        />
      </div>
      <form onSubmit={handleAddMember}>
        <input 
          type="text" 
          placeholder="이름 입력" 
          value={newMemberName} 
          onChange={(e) => setNewMemberName(e.target.value)} 
        />
        <button type="submit">추가</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="member-list">
        {members.map(m => (
          <span key={m}>{m} <button onClick={() => handleRemoveMember(m)}>x</button></span>
        ))}
      </div>
    </div>
  );
}
