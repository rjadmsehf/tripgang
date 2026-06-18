import React, { useState, useEffect } from 'react';
import { fetchRates, convertToKrw } from './services/exchangeRate';
import { parseReceiptWithGemini } from './services/gemini';
import './App.css';

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [members, setMembers] = useState(['민수', '지은', '혜원']); // 기본값
  const [newMemberName, setNewMemberName] = useState('');
  const [rates, setRates] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 카테고리 관련 상태
  const [categories, setCategories] = useState(['전체', '미분류', '편의점', '식비', '입장료']);
  const [activeCategory, setActiveCategory] = useState('전체');
  const [newCategoryName, setNewCategoryName] = useState('');

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
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    if (members.includes(trimmed)) {
      setError('이미 존재하는 동행자입니다.');
      return;
    }
    setMembers([...members, trimmed]);
    setNewMemberName('');
    setError('');
  };

  // 멤버 삭제
  const handleRemoveMember = (name) => {
    setMembers(members.filter(m => m !== name));
    const updatedReceipts = receipts.map(receipt => {
      const updatedAssignments = { ...receipt.assignments };
      Object.keys(updatedAssignments).forEach(itemId => {
        if (updatedAssignments[itemId]) {
          delete updatedAssignments[itemId][name];
        }
      });
      return { ...receipt, assignments: updatedAssignments };
    });
    setReceipts(updatedReceipts);
  };

  // 카테고리 추가
  const handleAddCategory = (e) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      setError('이미 존재하는 카테고리입니다.');
      return;
    }
    setCategories([...categories, trimmed]);
    setNewCategoryName('');
    setError('');
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
        
        const newReceipt = {
          id: Date.now(),
          name: parsed.storeName || '알 수 없는 가게', // 가게 이름을 기본 제목으로 사용
          currency: parsed.currency || 'KRW',
          totalAmount: parsed.totalAmount || 0,
          category: '미분류', // 기본 카테고리
          items: (parsed.items || []).map((item, idx) => ({
            id: `${Date.now()}-${idx}`,
            name: item.name,
            translatedName: item.translatedName || item.name,
            price: item.price || 0
          })),
          assignments: {}
        };

        newReceipt.items.forEach(item => {
          newReceipt.assignments[item.id] = {};
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

  // 샘플 영수증 로드
  const handleLoadSample = (currencyType) => {
    setError('');
    let sampleData;

    if (currencyType === 'JPY') {
      sampleData = {
        name: '이치란 라멘 도쿄점', // 기본 이름으로 가게명 지정
        currency: 'JPY',
        totalAmount: 3200,
        items: [
          { id: `sample-jpy-1`, name: '醤油ラーメン', translatedName: '쇼유 라멘', price: 980 },
          { id: `sample-jpy-2`, name: '豚骨ラーメン', translatedName: '돈코츠 라멘', price: 1050 },
          { id: `sample-jpy-3`, name: '焼き餃자', translatedName: '야끼 교자 (만두)', price: 420 },
          { id: `sample-jpy-4`, name: '生ビール', translatedName: '생맥주', price: 750 }
        ]
      };
    } else if (currencyType === 'CNY') {
      sampleData = {
        name: '하이디라오 상하이점', // 기본 이름으로 가게명 지정
        currency: 'CNY',
        totalAmount: 168,
        items: [
          { id: `sample-cny-1`, name: '麻辣烫 (基本)', translatedName: '마라탕 (기본)', price: 88 },
          { id: `sample-cny-2`, name: '꿔바로우 (小)', translatedName: '꿔바로우 (소)', price: 45 },
          { id: `sample-cny-3`, name: '青岛啤酒', translatedName: '칭따오 맥주', price: 20 },
          { id: `sample-cny-4`, name: '可口可乐', translatedName: '코카콜라', price: 15 }
        ]
      };
    }

    const newReceipt = {
      id: Date.now(),
      name: sampleData.name,
      currency: sampleData.currency,
      totalAmount: sampleData.totalAmount,
      category: '식비', // 샘플은 식비 카테고리로 기본 배분
      items: sampleData.items,
      assignments: {}
    };

    newReceipt.items.forEach(item => {
      newReceipt.assignments[item.id] = {};
    });

    setReceipts([...receipts, newReceipt]);
  };

  // 아이템 체크박스 토글 (멤버 지정/해제)
  const toggleAssignment = (receiptId, itemId, memberName) => {
    setReceipts(receipts.map(r => {
      if (r.id !== receiptId) return r;
      const currentAssignments = r.assignments[itemId] || {};
      const currentCount = currentAssignments[memberName] || 0;
      const updatedCount = currentCount > 0 ? 0 : 1;
      return {
        ...r,
        assignments: {
          ...r.assignments,
          [itemId]: {
            ...currentAssignments,
            [memberName]: updatedCount
          }
        }
      };
    }));
  };

  // 아이템 개수 직접 조정
  const adjustAssignmentCount = (receiptId, itemId, memberName, delta) => {
    setReceipts(receipts.map(r => {
      if (r.id !== receiptId) return r;
      const currentAssignments = r.assignments[itemId] || {};
      const currentCount = currentAssignments[memberName] || 0;
      const updatedCount = Math.max(0, currentCount + delta);
      return {
        ...r,
        assignments: {
          ...r.assignments,
          [itemId]: {
            ...currentAssignments,
            [memberName]: updatedCount
          }
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
        name: 'Manual Item',
        translatedName: '수동 추가 항목',
        price: ''
      };
      return {
        ...r,
        items: [...r.items, newItem],
        assignments: {
          ...r.assignments,
          [newItem.id]: {}
        }
      };
    }));
  };

  // 아이템 삭제 기능
  const handleRemoveItem = (receiptId, itemId) => {
    setReceipts(receipts.map(r => {
      if (r.id !== receiptId) return r;
      const updatedItems = r.items.filter(item => item.id !== itemId);
      const updatedAssignments = { ...r.assignments };
      delete updatedAssignments[itemId];
      return {
        ...r,
        items: updatedItems,
        assignments: updatedAssignments
      };
    }));
  };

  // 영수증 이름(제목) 수정
  const handleUpdateReceiptName = (receiptId, newName) => {
    setReceipts(receipts.map(r => {
      if (r.id === receiptId) {
        return { ...r, name: newName };
      }
      return r;
    }));
  };

  // 영수증 카테고리 지정
  const handleUpdateReceiptCategory = (receiptId, newCategory) => {
    setReceipts(receipts.map(r => {
      if (r.id === receiptId) {
        return { ...r, category: newCategory };
      }
      return r;
    }));
  };

  // 메뉴 가격 및 텍스트 수정
  const handleUpdateItemPrice = (receiptId, itemId, field, value) => {
    setReceipts(receipts.map(r => {
      if (r.id !== receiptId) return r;
      const updatedItems = r.items.map(item => {
        if (item.id !== itemId) return item;
        if (field === 'price') {
          return {
            ...item,
            price: value === '' ? '' : parseFloat(value) || 0
          };
        }
        return {
          ...item,
          [field]: value
        };
      });
      return { ...r, items: updatedItems };
    }));
  };

  // 영수증 삭제
  const handleRemoveReceipt = (receiptId) => {
    setReceipts(receipts.filter(r => r.id !== receiptId));
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
        const assignments = receipt.assignments[item.id] || {};
        const totalCount = Object.values(assignments).reduce((sum, val) => sum + val, 0);
        if (totalCount === 0) return; // 아무도 안 고른 항목 패스
        
        const itemPrice = parseFloat(item.price) || 0;

        Object.entries(assignments).forEach(([member, count]) => {
          if (count === 0) return;
          const memberShareRatio = count / totalCount;
          const splitPrice = itemPrice * memberShareRatio;
          const splitPriceKrw = rates ? convertToKrw(splitPrice, receipt.currency, rates) : splitPrice;

          if (balances[member]) {
            balances[member].foreignTotal += splitPrice;
            balances[member].krwTotal += splitPriceKrw;
            balances[member].itemsBreakdown.push({
              receiptName: receipt.name,
              itemName: item.translatedName,
              originalPrice: itemPrice,
              currency: receipt.currency,
              sharePrice: splitPrice,
              sharePriceKrw: splitPriceKrw,
              count,
              totalCount
            });
          }
        });
      });
    });

    return balances;
  };

  const memberBalances = calculateMemberBalances();

  // 총 정산 원화 누계
  const totalSettledKrw = Object.values(memberBalances).reduce((sum, item) => sum + item.krwTotal, 0);

  // 카테고리 필터링 된 영수증
  const filteredReceipts = receipts.filter(r => {
    if (activeCategory === '전체') return true;
    return (r.category || '미분류') === activeCategory;
  });

  return (
    <div className="app-container">
      {/* HEADER BANNER */}
      <header className="app-header">
        <div className="app-logo-area">
          <span className="app-icon">✈️</span>
          <h1>Travel Settlement</h1>
        </div>
        <div className="rates-ticker">
          {rates ? (
            <span style={{ fontSize: '0.9rem', color: 'var(--accent-teal)' }}>
              실시간 환율: 100 JPY = {convertToKrw(100, 'JPY', rates)}원 | 1 CNY = {convertToKrw(1, 'CNY', rates)}원
            </span>
          ) : (
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>환율 정보 로드 중...</span>
          )}
        </div>
      </header>

      {/* LEFT PANEL - CONFIG */}
      <aside className="left-panel">
        <div className="glass-card api-key-section">
          <h3>Gemini API Key</h3>
          <input 
            type="password" 
            placeholder="AI 분석용 API Key 입력" 
            value={apiKey} 
            onChange={handleSaveApiKey} 
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            * 입력하신 API 키는 브라우저에만 안전하게 저장됩니다.
          </span>
        </div>

        <div className="glass-card members-section">
          <h3>동행자 관리</h3>
          <form onSubmit={handleAddMember}>
            <input 
              type="text" 
              placeholder="이름 입력" 
              value={newMemberName} 
              onChange={(e) => setNewMemberName(e.target.value)} 
            />
            <button type="submit">추가</button>
          </form>
          <div className="members-list">
            {members.map(m => (
              <span className="member-chip" key={m}>
                {m}
                <button type="button" onClick={() => handleRemoveMember(m)}>×</button>
              </span>
            ))}
          </div>
        </div>

        <div className="glass-card uploader-section">
          <h3>영수증 추가</h3>
          <label className="uploader-area">
            <span className="uploader-icon">📸</span>
            <p style={{ margin: '0.5rem 0 0 0', fontWeight: '500' }}>영수증 사진 업로드</p>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>이미지 파일 선택</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} />
          </label>
          <div style={{ marginTop: '1.25rem' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
              💡 테스트용 샘플 영수증 로드:
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-secondary" style={{ flex: 1, padding: '0.5rem' }} onClick={() => handleLoadSample('JPY')}>
                🇯🇵 엔화 샘플
              </button>
              <button className="btn-secondary" style={{ flex: 1, padding: '0.5rem' }} onClick={() => handleLoadSample('CNY')}>
                🇨🇳 위안화 샘플
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* CENTER PANEL - RECEIPT VIEWER */}
      <main className="center-panel">
        {/* CATEGORY TABS */}
        <div className="category-tabs-container glass-card">
          <div className="category-tabs">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`category-tab-btn ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <form className="add-category-form" onSubmit={handleAddCategory}>
            <input
              type="text"
              placeholder="카테고리 추가"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <button type="submit">추가</button>
          </form>
        </div>

        {isLoading && (
          <div className="glass-card loader">
            <div className="spinner"></div>
            <p>Gemini AI가 영수증의 글자와 금액을 분석 중입니다...</p>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {filteredReceipts.length === 0 && !isLoading && (
          <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
            <span style={{ fontSize: '3rem' }}>🧾</span>
            <h3 style={{ marginTop: '1.5rem', color: 'var(--text-primary)' }}>해당 카테고리에 영수증이 없습니다</h3>
            <p style={{ fontSize: '0.95rem' }}>영수증을 등록하시거나, 등록된 영수증의 카테고리를 변경해 보세요.</p>
          </div>
        )}

        {filteredReceipts.map(receipt => (
          <div className="glass-card receipt-card" key={receipt.id}>
            <div className="receipt-header">
              {/* 수정 가능한 영수증 제목 인풋 */}
              <div className="receipt-title-wrapper">
                <input
                  type="text"
                  className="receipt-title-input"
                  value={receipt.name}
                  onChange={(e) => handleUpdateReceiptName(receipt.id, e.target.value)}
                  placeholder="영수증 이름 입력"
                />
              </div>
              <button className="btn-secondary btn-danger" style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }} onClick={() => handleRemoveReceipt(receipt.id)}>
                삭제
              </button>
            </div>
            
            <div className="receipt-meta">
              <span>통화: <strong>{receipt.currency}</strong></span>
              <span>총액: <strong>{receipt.totalAmount.toLocaleString()} {receipt.currency}</strong></span>
              {rates && (
                <span>원화 환산: <strong>{convertToKrw(receipt.totalAmount, receipt.currency, rates).toLocaleString()} 원</strong></span>
              )}
              {/* 카테고리 지정 셀렉터 */}
              <div className="receipt-category-selector">
                <label>분류: </label>
                <select
                  value={receipt.category || '미분류'}
                  onChange={(e) => handleUpdateReceiptCategory(receipt.id, e.target.value)}
                >
                  {categories.filter(cat => cat !== '전체').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <table className="receipt-items-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>메뉴명 (번역)</th>
                  <th style={{ width: '120px' }}>금액 ({receipt.currency})</th>
                  <th>정산 멤버별 수량 분할</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map(item => {
                  const assignments = receipt.assignments[item.id] || {};
                  return (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          type="button" 
                          className="btn-delete-item" 
                          title="항목 삭제" 
                          onClick={() => handleRemoveItem(receipt.id, item.id)}
                        >
                          ×
                        </button>
                      </td>
                      <td>
                        <input 
                          type="text" 
                          value={item.translatedName} 
                          onChange={(e) => handleUpdateItemPrice(receipt.id, item.id, 'translatedName', e.target.value)}
                          style={{ background: 'transparent', border: 'none', padding: 0, fontWeight: '500', color: 'var(--text-primary)' }}
                        />
                        <span className="item-original-name">{item.name}</span>
                      </td>
                      <td>
                        <input 
                          type="number" 
                          className="item-price-edit" 
                          value={item.price} 
                          onChange={(e) => handleUpdateItemPrice(receipt.id, item.id, 'price', e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <div className="assignee-selectors">
                          {members.map(member => {
                            const count = assignments[member] || 0;
                            const isAssigned = count > 0;
                            return (
                              <div key={member} className={`assignee-control ${isAssigned ? 'assigned' : ''}`}>
                                <span 
                                  className="assignee-name"
                                  onClick={() => toggleAssignment(receipt.id, item.id, member)}
                                >
                                  {member} {isAssigned && <span className="assignee-count">({count}개)</span>}
                                </span>
                                {isAssigned && (
                                  <div className="count-buttons">
                                    <button type="button" className="count-btn" onClick={() => adjustAssignmentCount(receipt.id, item.id, member, -1)}>-</button>
                                    <button type="button" className="count-btn" onClick={() => adjustAssignmentCount(receipt.id, item.id, member, 1)}>+</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="receipt-actions">
              <button className="btn-secondary" onClick={() => handleAddManualItem(receipt.id)}>
                ➕ 항목 추가
              </button>
            </div>
          </div>
        ))}
      </main>

      {/* RIGHT PANEL - SETTLEMENT SUMMARY */}
      <aside className="right-panel">
        <div className="glass-card settlement-card">
          <h2>동행자별 청구 내역</h2>
          {members.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>동행자를 먼저 추가해 주세요.</p>
          ) : (
            Object.entries(memberBalances).map(([name, data]) => (
              <div className="member-bill-card" key={name}>
                <div className="bill-header">
                  <span className="bill-name">{name}</span>
                  <span className="bill-total">{Math.round(data.krwTotal).toLocaleString()} 원</span>
                </div>
                
                {data.itemsBreakdown.length > 0 ? (
                  <div className="bill-items-list">
                    {data.itemsBreakdown.map((item, idx) => (
                      <div className="bill-item" key={idx}>
                        <span>
                          {item.itemName} 
                          <span style={{ color: 'var(--accent-teal)' }}> ({item.count}개 / 총 {item.totalCount}개)</span>
                        </span>
                        <span>
                          {Math.round(item.sharePrice).toLocaleString()}{item.currency} ({Math.round(item.sharePriceKrw).toLocaleString()}원)
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>지정된 메뉴가 없습니다.</p>
                )}
              </div>
            ))
          )}
        </div>

        <div className="glass-card summary-card">
          <h2>최종 정산 요약</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              <span>등록된 영수증 수</span>
              <span style={{ marginLeft: 'auto' }}>{receipts.length} 개</span>
            </div>
            <div className="summary-row">
              <span>총 정산 금액</span>
              <span>{Math.round(totalSettledKrw).toLocaleString()} 원</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
