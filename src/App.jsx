import React, { useState, useEffect, useRef } from 'react';
import { Peer } from 'peerjs';
import { fetchRates, convertToKrw } from './services/exchangeRate';
import { parseReceiptWithGemini } from './services/gemini';
import { MSG_TYPES, PEER_OPTIONS } from './services/peerService';
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

  // 멀티플레이어 공동 편집 관련 상태
  const [isHost, setIsHost] = useState(true);
  const [roomId, setRoomId] = useState('');
  const [nickname, setNickname] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  
  // 호스트 전용 상태
  const [connections, setConnections] = useState([]); // 커넥션 인스턴스 배열
  const [guests, setGuests] = useState({}); // connection.peer -> nickname 맵핑
  const [guestPermissions, setGuestPermissions] = useState({}); // connection.peer -> boolean (수정 권한 여부)

  // 게스트 전용 상태
  const [hostConnection, setHostConnection] = useState(null);
  const [hasEditPermission, setHasEditPermission] = useState(false);

  const peerRef = useRef(null);
  const connectionsRef = useRef([]);

  // URL에서 room 파라미터 감지
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setIsHost(false);
      setRoomId(roomParam);
    } else {
      // 호스트인 경우 자동으로 방 ID 생성
      setIsHost(true);
      const generatedRoomId = `trip-room-${Math.random().toString(36).substring(2, 9)}`;
      setRoomId(generatedRoomId);
    }
  }, []);

  // 환율 로드
  useEffect(() => {
    fetchRates().then(setRates);
  }, []);

  // P2P 연결 수립 (호스트 및 게스트 세션)
  useEffect(() => {
    if (!roomId) return;

    if (isHost) {
      // 1. 호스트 연결 초기화
      const peer = new Peer(roomId, PEER_OPTIONS);
      peerRef.current = peer;

      peer.on('open', (id) => {
        console.log('방 개설 성공. Peer ID:', id);
      });

      peer.on('connection', (conn) => {
        console.log('게스트 접속 시도:', conn.peer);
        
        conn.on('data', (data) => {
          handleDataFromGuest(conn, data);
        });

        conn.on('close', () => {
          console.log('게스트 접속 종료:', conn.peer);
          setConnections(prev => prev.filter(c => c.peer !== conn.peer));
          setGuests(prev => {
            const updated = { ...prev };
            delete updated[conn.peer];
            return updated;
          });
          setGuestPermissions(prev => {
            const updated = { ...prev };
            delete updated[conn.peer];
            return updated;
          });
        });

        conn.on('error', (err) => {
          console.error('커넥션 에러:', err);
        });

        connectionsRef.current = [...connectionsRef.current, conn];
        setConnections(connectionsRef.current);
      });

      peer.on('error', (err) => {
        console.error('Peer 에러:', err);
        if (err.type === 'unavailable-id') {
          setError('해당 방 ID가 이미 사용 중입니다. 새로고침을 실행해 주세요.');
        } else {
          setError(`네트워크 오류가 발생했습니다: ${err.message}`);
        }
      });

      return () => {
        peer.destroy();
      };
    }
  }, [roomId, isHost]);

  // 호스트가 게스트로부터 전송받은 데이터 처리
  const handleDataFromGuest = (conn, data) => {
    const { type, payload } = data;

    switch (type) {
      case MSG_TYPES.REQ_JOIN:
        // 게스트의 조인 승인 및 닉네임 매핑
        setGuests(prev => ({
          ...prev,
          [conn.peer]: payload.nickname
        }));
        // 기본적으로 신규 접속 게스트는 편집 권한 미부여(방장이 부여하게 설정)
        setGuestPermissions(prev => ({
          ...prev,
          [conn.peer]: false
        }));
        
        // 동행자 목록에 게스트 이름이 없는 경우 자동으로 멤버 추가 전파
        applyAction({ type: 'ADD_MEMBER', payload: payload.nickname });
        break;

      case MSG_TYPES.REQUEST_EDIT:
        // 게스트가 편집 요청을 보낸 경우 권한 검증 후 반영
        setGuestPermissions(currentPerms => {
          if (currentPerms[conn.peer]) {
            // 권한이 활성화된 게스트의 액션만 상태에 적용
            applyAction(payload);
          } else {
            conn.send({
              type: MSG_TYPES.PERM_UPDATE,
              payload: { allowed: false, error: '방장에게 편집 권한 부여를 요청하세요.' }
            });
          }
          return currentPerms;
        });
        break;

      case 'REQUEST_OCR':
        // 게스트가 이미지 분석 요청을 보낸 경우 권한 검증 후 처리
        setGuestPermissions(currentPerms => {
          if (currentPerms[conn.peer]) {
            setIsLoading(true);
            parseReceiptWithGemini(apiKey, payload.base64)
              .then(parsed => {
                const newReceipt = {
                  id: Date.now(),
                  name: parsed.storeName || payload.fileName.split('.')[0] || '새로운 영수증',
                  currency: parsed.currency || 'KRW',
                  totalAmount: parsed.totalAmount || 0,
                  category: '미분류',
                  items: (parsed.items || []).map((item, idx) => ({
                    id: `${Date.now()}-${idx}`,
                    name: item.name,
                    translatedName: item.translatedName || item.name,
                    price: item.price !== undefined ? item.price : 0,
                    quantity: item.quantity !== undefined ? item.quantity : 1
                  })),
                  assignments: {}
                };
                newReceipt.items.forEach(item => {
                  newReceipt.assignments[item.id] = {};
                });
                applyAction({ type: 'ADD_RECEIPT', payload: newReceipt });
              })
              .catch(err => {
                console.error('OCR 처리 실패:', err);
              })
              .finally(() => {
                setIsLoading(false);
              });
          } else {
            conn.send({
              type: MSG_TYPES.PERM_UPDATE,
              payload: { allowed: false, error: '방장에게 편집 권한 부여를 요청하세요.' }
            });
          }
          return currentPerms;
        });
        break;

      default:
        break;
    }
  };

  // 호스트 상태가 바뀔 때 모든 게스트에게 최신 정산 데이터 브로드캐스트
  useEffect(() => {
    if (!isHost) return;
    
    connections.forEach(conn => {
      if (conn.open) {
        conn.send({
          type: MSG_TYPES.STATE_UPDATE,
          payload: {
            receipts,
            members,
            categories,
            guestPermissions // 각 게스트에게 권한 상태 업데이트 전송
          }
        });
      }
    });
  }, [receipts, members, categories, connections, guestPermissions, isHost]);

  // 게스트 연결 함수 (조인 버튼 누를 시 실행)
  const handleJoinRoom = (e) => {
    e.preventDefault();
    const trimmedNick = nickname.trim();
    if (!trimmedNick) return;

    setError('');
    setIsLoading(true);

    const peer = new Peer(PEER_OPTIONS);
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('게스트 Peer 초기화 완료. ID:', id);
      
      const conn = peer.connect(roomId);
      setHostConnection(conn);

      conn.on('open', () => {
        console.log('호스트 방과 연결 수립 성공!');
        setIsLoading(false);
        setIsJoined(true);

        // 조인 요청 전송
        conn.send({
          type: MSG_TYPES.REQ_JOIN,
          payload: { nickname: trimmedNick }
        });
      });

      conn.on('data', (data) => {
        handleDataFromHost(id, data);
      });

      conn.on('close', () => {
        setIsJoined(false);
        setError('방장과의 연결이 해제되었습니다.');
      });

      conn.on('error', (err) => {
        console.error('연결 오류:', err);
        setIsLoading(false);
        setError('방에 접속하지 못했습니다. 방 링크를 다시 확인하세요.');
      });
    });

    peer.on('error', (err) => {
      console.error('Peer 초기화 에러:', err);
      setIsLoading(false);
      setError('네트워크 연결 초기화에 실패했습니다.');
    });
  };

  // 게스트가 호스트로부터 수신받은 데이터 처리
  const handleDataFromHost = (myPeerId, data) => {
    const { type, payload } = data;

    switch (type) {
      case MSG_TYPES.STATE_UPDATE:
        // 전체 정산 상태 동기화
        setReceipts(payload.receipts);
        setMembers(payload.members);
        setCategories(payload.categories);
        
        // 내 권한 정보 동기화
        if (payload.guestPermissions && payload.guestPermissions[myPeerId] !== undefined) {
          setHasEditPermission(payload.guestPermissions[myPeerId]);
        }
        break;

      case MSG_TYPES.PERM_UPDATE:
        if (!payload.allowed) {
          setError(payload.error);
        }
        break;

      default:
        break;
    }
  };

  // 방장이 게스트 권한 토글하는 핸들러
  const handleTogglePermission = (peerId) => {
    setGuestPermissions(prev => {
      const updatedValue = !prev[peerId];
      // 토글된 결과를 즉시 해당 게스트에게도 전달
      const conn = connections.find(c => c.peer === peerId);
      if (conn && conn.open) {
        conn.send({
          type: MSG_TYPES.PERM_UPDATE,
          payload: { allowed: updatedValue, error: updatedValue ? '' : '수정 권한이 회수되었습니다.' }
        });
      }
      return {
        ...prev,
        [peerId]: updatedValue
      };
    });
  };

  // API Key 저장
  const handleSaveApiKey = (e) => {
    const val = e.target.value;
    setApiKey(val);
    localStorage.setItem('gemini_api_key', val);
  };

  // 동적 정산 상태 변경 디스패처 (로컬 vs 원격 동기화 라우팅)
  const dispatchAction = (action) => {
    if (isHost) {
      applyAction(action);
    } else {
      if (!hasEditPermission) {
        setError('수정 권한이 없습니다. 방장에게 권한을 요청해 주세요.');
        return;
      }
      if (hostConnection && hostConnection.open) {
        hostConnection.send({
          type: MSG_TYPES.REQUEST_EDIT,
          payload: action
        });
      }
    }
  };

  // 실제 상태 적용 리듀서
  const applyAction = (action) => {
    const { type, payload } = action;

    switch (type) {
      case 'ADD_MEMBER':
        setMembers(prev => {
          if (prev.includes(payload)) return prev;
          return [...prev, payload];
        });
        break;

      case 'REMOVE_MEMBER':
        setMembers(prev => prev.filter(m => m !== payload));
        setReceipts(prev => prev.map(receipt => {
          const updatedAssignments = { ...receipt.assignments };
          Object.keys(updatedAssignments).forEach(itemId => {
            if (updatedAssignments[itemId]) {
              delete updatedAssignments[itemId][payload];
            }
          });
          return { ...receipt, assignments: updatedAssignments };
        }));
        break;

      case 'ADD_CATEGORY':
        setCategories(prev => {
          if (prev.includes(payload)) return prev;
          return [...prev, payload];
        });
        break;

      case 'ADD_RECEIPT':
        setReceipts(prev => [...prev, payload]);
        break;

      case 'REMOVE_RECEIPT':
        setReceipts(prev => prev.filter(r => r.id !== payload));
        break;

      case 'TOGGLE_ASSIGNMENT': {
        const { receiptId, itemId, memberName } = payload;
        setReceipts(prev => prev.map(r => {
          if (r.id !== receiptId) return r;
          const item = r.items.find(i => i.id === itemId);
          const currentAssignments = r.assignments[itemId] || {};
          const currentCount = currentAssignments[memberName] || 0;
          const currentSum = Object.values(currentAssignments).reduce((sum, val) => sum + val, 0);
          const updatedCount = currentCount > 0 ? 0 : 1;

          if (updatedCount > 0 && currentSum + 1 > (parseInt(item.quantity) || 1)) {
            return r; // 한도 초과 차단
          }
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
        break;
      }

      case 'ADJUST_COUNT': {
        const { receiptId, itemId, memberName, delta } = payload;
        setReceipts(prev => prev.map(r => {
          if (r.id !== receiptId) return r;
          const item = r.items.find(i => i.id === itemId);
          const currentAssignments = r.assignments[itemId] || {};
          const currentCount = currentAssignments[memberName] || 0;
          const currentSum = Object.values(currentAssignments).reduce((sum, val) => sum + val, 0);
          const newCount = currentCount + delta;

          if (delta > 0 && currentSum + delta > (parseInt(item.quantity) || 1)) {
            return r;
          }
          if (newCount < 0) return r;

          return {
            ...r,
            assignments: {
              ...r.assignments,
              [itemId]: {
                ...currentAssignments,
                [memberName]: newCount
              }
            }
          };
        }));
        break;
      }

      case 'ADD_MANUAL_ITEM':
        setReceipts(prev => prev.map(r => {
          if (r.id !== payload) return r;
          const newItem = {
            id: `manual-${Date.now()}`,
            name: 'Manual Item',
            translatedName: '수동 추가 항목',
            price: '',
            quantity: 1
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
        break;

      case 'REMOVE_ITEM': {
        const { receiptId, itemId } = payload;
        setReceipts(prev => prev.map(r => {
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
        break;
      }

      case 'UPDATE_RECEIPT_NAME': {
        const { receiptId, name } = payload;
        setReceipts(prev => prev.map(r => {
          if (r.id === receiptId) return { ...r, name };
          return r;
        }));
        break;
      }

      case 'UPDATE_RECEIPT_CATEGORY': {
        const { receiptId, category } = payload;
        setReceipts(prev => prev.map(r => {
          if (r.id === receiptId) return { ...r, category };
          return r;
        }));
        break;
      }

      case 'UPDATE_ITEM': {
        const { receiptId, itemId, field, value } = payload;
        setReceipts(prev => prev.map(r => {
          if (r.id !== receiptId) return r;

          if (field === 'quantity') {
            const assignments = r.assignments[itemId] || {};
            const currentSum = Object.values(assignments).reduce((sum, val) => sum + val, 0);
            const parsedVal = value === '' ? '' : parseInt(value) || 1;
            if (parsedVal !== '' && parsedVal < currentSum) {
              return r;
            }
          }

          const updatedItems = r.items.map(item => {
            if (item.id !== itemId) return item;
            if (field === 'price') {
              return {
                ...item,
                price: value === '' ? '' : parseFloat(value) || 0
              };
            }
            if (field === 'quantity') {
              return {
                ...item,
                quantity: value === '' ? '' : parseInt(value) || 1
              };
            }
            return {
              ...item,
              [field]: value
            };
          });
          return { ...r, items: updatedItems };
        }));
        break;
      }

      default:
        break;
    }
  };

  // 로컬 UI 핸들러들 (action 디스패치 적용)
  const handleAddMemberAction = (e) => {
    e.preventDefault();
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    if (members.includes(trimmed)) {
      setError('이미 존재하는 동행자입니다.');
      return;
    }
    dispatchAction({ type: 'ADD_MEMBER', payload: trimmed });
    setNewMemberName('');
    setError('');
  };

  const handleRemoveMemberAction = (name) => {
    dispatchAction({ type: 'REMOVE_MEMBER', payload: name });
  };

  const handleAddCategoryAction = (e) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      setError('이미 존재하는 카테고리입니다.');
      return;
    }
    dispatchAction({ type: 'ADD_CATEGORY', payload: trimmed });
    setNewCategoryName('');
    setError('');
  };

  const handleAddManualItemAction = (receiptId) => {
    dispatchAction({ type: 'ADD_MANUAL_ITEM', payload: receiptId });
  };

  const handleRemoveItemAction = (receiptId, itemId) => {
    dispatchAction({ type: 'REMOVE_ITEM', payload: { receiptId, itemId } });
  };

  const handleUpdateReceiptNameAction = (receiptId, name) => {
    dispatchAction({ type: 'UPDATE_RECEIPT_NAME', payload: { receiptId, name } });
  };

  const handleUpdateReceiptCategoryAction = (receiptId, category) => {
    dispatchAction({ type: 'UPDATE_RECEIPT_CATEGORY', payload: { receiptId, category } });
  };

  const handleUpdateItemPriceAction = (receiptId, itemId, field, value) => {
    dispatchAction({ type: 'UPDATE_ITEM', payload: { receiptId, itemId, field, value } });
  };

  const handleRemoveReceiptAction = (receiptId) => {
    dispatchAction({ type: 'REMOVE_RECEIPT', payload: receiptId });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setError('');

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result;
        if (isHost) {
          if (!apiKey) {
            setError('영수증 분석을 위해 Gemini API Key를 먼저 입력해 주세요.');
            setIsLoading(false);
            return;
          }
          const parsed = await parseReceiptWithGemini(apiKey, base64);
          const newReceipt = {
            id: Date.now(),
            name: parsed.storeName || file.name.split('.')[0] || '새로운 영수증',
            currency: parsed.currency || 'KRW',
            totalAmount: parsed.totalAmount || 0,
            category: '미분류',
            items: (parsed.items || []).map((item, idx) => ({
              id: `${Date.now()}-${idx}`,
              name: item.name,
              translatedName: item.translatedName || item.name,
              price: item.price !== undefined ? item.price : 0,
              quantity: item.quantity !== undefined ? item.quantity : 1
            })),
            assignments: {}
          };
          newReceipt.items.forEach(item => {
            newReceipt.assignments[item.id] = {};
          });
          applyAction({ type: 'ADD_RECEIPT', payload: newReceipt });
        } else {
          // 게스트의 경우 호스트에게 이미지 분석을 위임(P2P 메시지 전송)
          if (hostConnection && hostConnection.open) {
            hostConnection.send({
              type: 'REQUEST_OCR',
              payload: { base64, fileName: file.name }
            });
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLoadSample = (currency) => {
    let mockReceipt;
    if (currency === 'JPY') {
      mockReceipt = {
        id: Date.now(),
        name: '도쿄 이치란 라멘',
        currency: 'JPY',
        totalAmount: 3200,
        category: '식비',
        items: [
          { id: `${Date.now()}-1`, name: '豚骨ラーメン', translatedName: '돈코츠 라멘', price: 980, quantity: 2 },
          { id: `${Date.now()}-2`, name: '替玉', translatedName: '면 사리 추가', price: 210, quantity: 1 },
          { id: `${Date.now()}-3`, name: '生ビール', translatedName: '생맥주', price: 510, quantity: 2 }
        ],
        assignments: {}
      };
    } else if (currency === 'CNY') {
      mockReceipt = {
        id: Date.now(),
        name: '북경 하이디라오훠궈',
        currency: 'CNY',
        totalAmount: 350,
        category: '식비',
        items: [
          { id: `${Date.now()}-1`, name: '麻辣锅底', translatedName: '마라 탕저리', price: 88, quantity: 1 },
          { id: `${Date.now()}-2`, name: '精品肥牛', translatedName: '소고기 슬라이스', price: 78, quantity: 2 },
          { id: `${Date.now()}-3`, name: '蔬菜拼盘', translatedName: '야채 모듬', price: 38, quantity: 1 },
          { id: `${Date.now()}-4`, name: '酸梅汤', translatedName: '매실차', price: 15, quantity: 4 }
        ],
        assignments: {}
      };
    }

    if (mockReceipt) {
      mockReceipt.items.forEach(item => {
        mockReceipt.assignments[item.id] = {};
      });
      dispatchAction({ type: 'ADD_RECEIPT', payload: mockReceipt });
    }
  };

  const toggleAssignment = (receiptId, itemId, memberName) => {
    dispatchAction({
      type: 'TOGGLE_ASSIGNMENT',
      payload: { receiptId, itemId, memberName }
    });
  };

  const adjustAssignmentCount = (receiptId, itemId, memberName, delta) => {
    dispatchAction({
      type: 'ADJUST_COUNT',
      payload: { receiptId, itemId, memberName, delta }
    });
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
        if (totalCount === 0) return;
        
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

  // 초대 링크 정보 정의
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`;

  // 편집 필드 비활성화 조건 정의
  const isInputDisabled = !isHost && !hasEditPermission;

  // 게스트가 닉네임 입력 전 접속 화면 렌더링
  if (!isHost && !isJoined) {
    return (
      <div className="join-container">
        <div className="glass-card join-card">
          <h2>✈️ 여행 정산 방 참여하기</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            동행자가 공유한 실시간 정산 세션에 연결합니다. 사용하실 이름을 입력해 주세요.
          </p>
          <form onSubmit={handleJoinRoom}>
            <input
              type="text"
              placeholder="본인의 이름 입력"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
            />
            <button type="submit" style={{ marginTop: '1rem', width: '100%' }}>
              {isLoading ? '연결 중...' : '참여하기'}
            </button>
          </form>
          {error && <p className="error-message" style={{ marginTop: '1rem' }}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* HEADER BANNER */}
      <header className="app-header">
        <div className="app-logo-area">
          <span className="app-icon">✈️</span>
          <h1>Travel Settlement</h1>
          {!isHost && (
            <span className={`connection-badge ${hasEditPermission ? 'permission-write' : 'permission-read'}`}>
              {hasEditPermission ? '공동 편집중 (쓰기 권한)' : '관전 모드 (읽기 전용)'}
            </span>
          )}
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
        {isHost ? (
          /* 초대 제어판 (호스트만 노출) */
          <div className="glass-card invite-section">
            <h3>👥 실시간 정산 초대</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
              QR 코드를 동행자들에게 보여주거나 아래 초대 링크를 전송하여 실시간 공동 편집을 시작하세요!
            </p>
            <div className="qr-wrapper">
              <img src={qrCodeUrl} alt="QR Code" className="qr-image" />
            </div>
            <input 
              type="text" 
              readOnly 
              value={shareUrl} 
              onClick={(e) => e.target.select()}
              style={{ fontSize: '0.8rem', textAlign: 'center', marginTop: '0.75rem', cursor: 'pointer' }}
            />
            <button 
              type="button" 
              style={{ marginTop: '0.5rem', width: '100%' }}
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                alert('초대 링크가 복사되었습니다!');
              }}
            >
              링크 복사하기
            </button>
          </div>
        ) : (
          /* 권한 현황판 (게스트용 노출) */
          <div className="glass-card invite-section" style={{ textAlign: 'center' }}>
            <h3>👥 정산 세션 연결됨</h3>
            <p style={{ fontSize: '0.9rem', margin: '0.5rem 0' }}>
              닉네임: <strong style={{ color: 'var(--accent-pink)' }}>{nickname}</strong>
            </p>
            <span className={`permission-indicator ${hasEditPermission ? 'active' : ''}`}>
              {hasEditPermission ? '✍️ 수정 가능 상태' : '👁️ 방장의 편집 권한 승인 대기 중'}
            </span>
          </div>
        )}

        {isHost && (
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
        )}

        {/* 방장의 실시간 접속자 권한 관리 리스트 */}
        {isHost && connections.length > 0 && (
          <div className="glass-card guests-management-section">
            <h3>접속한 동행자 권한</h3>
            <div className="guests-list">
              {Object.entries(guests).map(([peerId, guestName]) => {
                const hasPerm = guestPermissions[peerId] || false;
                return (
                  <div key={peerId} className="guest-item">
                    <span>{guestName}</span>
                    <label className="switch-label">
                      <input 
                        type="checkbox" 
                        checked={hasPerm}
                        onChange={() => handleTogglePermission(peerId)}
                      />
                      <span className="switch-slider"></span>
                      {hasPerm ? '편집 허용' : '읽기 전용'}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="glass-card members-section">
          <h3>동행자 목록</h3>
          {isHost && (
            <form onSubmit={handleAddMemberAction}>
              <input 
                type="text" 
                placeholder="이름 입력" 
                value={newMemberName} 
                onChange={(e) => setNewMemberName(e.target.value)} 
              />
              <button type="submit">추가</button>
            </form>
          )}
          <div className="members-list">
            {members.map(m => (
              <span className="member-chip" key={m}>
                {m}
                {isHost && <button type="button" onClick={() => handleRemoveMemberAction(m)}>×</button>}
              </span>
            ))}
          </div>
        </div>

        {/* 호스트 혹은 수정 권한 게스트에게만 영수증 업로더 제공 */}
        {(!isInputDisabled) && (
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
        )}
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
          {!isInputDisabled && (
            <form className="add-category-form" onSubmit={handleAddCategoryAction}>
              <input
                type="text"
                placeholder="카테고리 추가"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button type="submit">추가</button>
            </form>
          )}
        </div>

        {isLoading && (
          <div className="glass-card loader">
            <div className="spinner"></div>
            <p>Gemini AI 분석 또는 연결 구성 중...</p>
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
              <div className="receipt-title-wrapper">
                <input
                  type="text"
                  className="receipt-title-input"
                  value={receipt.name}
                  onChange={(e) => handleUpdateReceiptNameAction(receipt.id, e.target.value)}
                  placeholder="영수증 이름 입력"
                  disabled={isInputDisabled}
                />
              </div>
              {!isInputDisabled && (
                <button className="btn-secondary btn-danger" style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }} onClick={() => handleRemoveReceiptAction(receipt.id)}>
                  삭제
                </button>
              )}
            </div>
            
            <div className="receipt-meta">
              <span>통화: <strong>{receipt.currency}</strong></span>
              <span>총액: <strong>{receipt.totalAmount.toLocaleString()} {receipt.currency}</strong></span>
              {rates && (
                <span>원화 환산: <strong>{convertToKrw(receipt.totalAmount, receipt.currency, rates).toLocaleString()} 원</strong></span>
              )}
              
              <div className="receipt-category-selector">
                <label>분류: </label>
                <select
                  value={receipt.category || '미분류'}
                  onChange={(e) => handleUpdateReceiptCategoryAction(receipt.id, e.target.value)}
                  disabled={isInputDisabled}
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
                  {!isInputDisabled && <th style={{ width: '40px' }}></th>}
                  <th>메뉴명 (번역)</th>
                  <th style={{ width: '110px' }}>금액 ({receipt.currency})</th>
                  <th style={{ width: '70px' }}>총 수량</th>
                  <th>정산 멤버별 수량 분할</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map(item => {
                  const assignments = receipt.assignments[item.id] || {};
                  const currentSum = Object.values(assignments).reduce((sum, val) => sum + val, 0);
                  const isPlusDisabled = currentSum >= (parseInt(item.quantity) || 1) || isInputDisabled;

                  return (
                    <tr key={item.id}>
                      {!isInputDisabled && (
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            type="button" 
                            className="btn-delete-item" 
                            title="항목 삭제" 
                            onClick={() => handleRemoveItemAction(receipt.id, item.id)}
                          >
                            ×
                          </button>
                        </td>
                      )}
                      <td>
                        <input 
                          type="text" 
                          value={item.translatedName} 
                          onChange={(e) => handleUpdateItemPriceAction(receipt.id, item.id, 'translatedName', e.target.value)}
                          style={{ background: 'transparent', border: 'none', padding: 0, fontWeight: '500', color: 'var(--text-primary)' }}
                          disabled={isInputDisabled}
                        />
                        <span className="item-original-name">{item.name}</span>
                      </td>
                      <td>
                        <input 
                          type="number" 
                          className="item-price-edit" 
                          value={item.price} 
                          onChange={(e) => handleUpdateItemPriceAction(receipt.id, item.id, 'price', e.target.value)}
                          placeholder="0"
                          disabled={isInputDisabled}
                        />
                      </td>
                      <td>
                        <input 
                          type="number" 
                          className="item-price-edit" 
                          value={item.quantity} 
                          onChange={(e) => handleUpdateItemPriceAction(receipt.id, item.id, 'quantity', e.target.value)}
                          placeholder="1"
                          min="1"
                          style={{ width: '55px' }}
                          disabled={isInputDisabled}
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
                                  onClick={() => !isInputDisabled && toggleAssignment(receipt.id, item.id, member)}
                                >
                                  {member} {isAssigned && <span className="assignee-count">({count}개)</span>}
                                </span>
                                {isAssigned && !isInputDisabled && (
                                  <div className="count-buttons">
                                    <button type="button" className="count-btn" onClick={() => adjustAssignmentCount(receipt.id, item.id, member, -1)}>-</button>
                                    <button 
                                      type="button" 
                                      className="count-btn" 
                                      disabled={isPlusDisabled}
                                      onClick={() => adjustAssignmentCount(receipt.id, item.id, member, 1)}
                                    >
                                      +
                                    </button>
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

            {!isInputDisabled && (
              <div className="receipt-actions">
                <button className="btn-secondary" onClick={() => handleAddManualItemAction(receipt.id)}>
                  ➕ 항목 추가
                </button>
              </div>
            )}
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
