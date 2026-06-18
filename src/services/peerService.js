export const MSG_TYPES = {
  STATE_UPDATE: 'STATE_UPDATE', // 호스트 -> 게스트: 최신 정산 상태 동기화
  REQUEST_EDIT: 'REQUEST_EDIT', // 게스트 -> 호스트: 편집 요청 (아이템 추가/할당 등)
  REQ_JOIN: 'REQ_JOIN',         // 게스트 -> 호스트: 닉네임과 함께 조인 요청
  PERM_UPDATE: 'PERM_UPDATE'    // 호스트 -> 게스트: 권한 상태 공지 (수정 가능 여부)
};

// PeerJS 공용 시그널링 서버 연결 옵션
export const PEER_OPTIONS = {
  host: '0.peerjs.com',
  port: 443,
  secure: true,
  path: '/'
};
