# 2026-06-19 Session Invite and Permissions Design Spec

본 문서는 PeerJS 기반 실시간 공동 정산 세션 초대(링크/QR코드) 및 호스트 권한 제어 기능의 설계 사양서입니다.

---

## 1. 개요 및 요구사항
- **세션 초대**: 호스트는 고유 방 ID가 담긴 초대 링크와 QR 코드를 노출하고, 복사 기능을 제공합니다.
- **실시간 공동 정산**: PeerJS(WebRTC)를 통해 게스트가 참여하며, 호스트-게스트 간 정산 상태(영수증, 멤버, 카테고리)를 실시간 동기화합니다.
- **수정 권한 관리**: 
  - 방장(호스트)은 실시간으로 접속한 게스트 목록을 확인하고, 스위치 토글을 통해 '편집 허용(쓰기 권한)' 또는 '읽기 전용'을 제어할 수 있습니다.
  - 권한이 없는 게스트는 모든 편집 입력 필드와 업로더가 비활성화되며, 수정을 시도할 경우 에러 메시지가 표시됩니다.
  - 권한이 있는 게스트는 정산 항목 수정, 배분 변경 등의 액션을 호스트에게 요청하고, 호스트는 이를 반영하여 전체에 브로드캐스트합니다.

---

## 2. 설계 상세

### A. 초대 방식 (Link & QR Code)
- **초대 링크**: `${window.location.origin}${window.location.pathname}?room=${roomId}`
- **QR 코드**: 무료 오픈 API(`https://api.qrserver.com/v1/create-qr-code/`)를 사용해 동적으로 QR 코드 이미지 생성 및 표시.
- **Vercel 호환성**: 라우터 없이 `window.location` 객체를 사용하므로 Vercel 서버리스 배포 환경에서도 별도의 서버 구성 없이 동작합니다.

### B. 권한 및 메시징 구조
- **호스트의 게스트 권한 관리**:
  - `guests` 상태: `peerId` -> `nickname` 매핑.
  - `guestPermissions` 상태: `peerId` -> `boolean` (쓰기 권한 여부).
- **메시지 타입 (`MSG_TYPES`)**:
  - `STATE_UPDATE`: 호스트가 게스트에게 최신 영수증/멤버/카테고리/권한 상태를 브로드캐스트.
  - `REQUEST_EDIT`: 게스트가 호스트에게 수정을 요청 (액션 객체 전달). 호스트는 게스트의 수정 권한 여부를 판별하여 수정 실행 후 전체 게스트에게 브로드캐스트.
  - `REQ_JOIN`: 게스트가 닉네임을 들고 방에 입장을 요청.
  - `PERM_UPDATE`: 호스트가 개별 게스트에게 권한 변경(allowed true/false)을 직접 전송.

### C. 컴파일 오류 수정 (Missing Functions)
`src/App.jsx`에서 템플릿 코드 작성 중 누락된 핵심 핸들러 함수들을 구현합니다.
- **`handleImageUpload`**: 업로드된 이미지를 base64로 인코딩한 뒤 `parseReceiptWithGemini`를 수행해 `ADD_RECEIPT` 액션을 디스패치합니다. (방장 API key 또는 게스트 자신의 key 사용)
- **`handleLoadSample`**: 엔화/위안화 샘플 데이터를 생성하여 `ADD_RECEIPT` 액션을 디스패치합니다.
- **`toggleAssignment`**: 특정 아이템의 특정 동행자 할당 여부를 토글하는 `TOGGLE_ASSIGNMENT` 액션을 디스패치합니다.
- **`adjustAssignmentCount`**: 특정 아이템의 특정 동행자 할당 수량을 증감하는 `ADJUST_COUNT` 액션을 디스패치합니다.

---

## 3. UI/UX 구성 (Vanilla CSS)
- **접속 팝업 / 조인 카드 (`.join-container`, `.join-card`)**: 게스트가 초대 링크를 타고 왔을 때 닉네임을 입력하고 방에 접속하는 화면.
- **초대 제어판 (`.invite-section`)**: 호스트 전용 화면으로, QR 코드와 공유 링크 복사 버튼을 깔끔하게 배치.
- **동행자 권한 스위치 (`.guests-management-section`, `.switch-label`)**: 호스트 전용 화면으로, 실시간 접속한 동행자의 닉네임과 스위치(편집 허용/읽기 전용) 제공.
- **입력 제한**: `isInputDisabled` 값에 따라 input tag의 `disabled` 속성 활성화.

---

## 4. 검증 계획
- **자동화 테스트**: `src/App.test.jsx`에서 `ReferenceError`를 수정하고, 멤버 추가 기능이 정상 작동하는지 확인합니다.
- **수동 테스트**:
  - 로컬 브라우저 창 2개(Host 창, Guest 창)를 띄워 실시간 닉네임 참여 확인.
  - Host 창에서 Guest의 '편집 허용' 토글을 켰다 껐다 하면서 Guest 창의 입력 제어 및 경고창 정상 표시 여부 검증.
  - Vercel 배포를 위한 빌드 검증 (`npm run build`).
