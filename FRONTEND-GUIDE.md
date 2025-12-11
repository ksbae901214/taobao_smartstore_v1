# 🎨 프론트엔드 UI 추가 가이드

## 📋 현재 상황
✅ Docker 컨테이너들이 모두 정상 실행 중  
❌ 프론트엔드 UI가 없어서 "Cannot GET /" 에러

---

## ⚡ 해결 방법 (2가지)

### 방법 1: 자동 배포 스크립트 (추천!) ⭐

```bash
# 프로젝트 폴더로 이동
cd /Users/kyusik/taobao-smartstore

# 다운로드한 파일들을 프로젝트 폴더로 복사
# - frontend-index.html
# - backend-server-updated.ts
# - deploy-frontend.sh

# 자동 배포 실행
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```

**끝!** 자동으로 브라우저가 열리고 UI가 표시됩니다! 🎉

---

### 방법 2: 수동 설치

#### STEP 1: 파일 배치

```bash
cd /Users/kyusik/taobao-smartstore

# public 폴더 생성
mkdir -p backend/public

# frontend-index.html을 index.html로 복사
cp ~/Downloads/frontend-index.html backend/public/index.html

# server.ts 업데이트
cp ~/Downloads/backend-server-updated.ts backend/src/server.ts
```

#### STEP 2: Backend 재시작

```bash
# Backend 컨테이너 재시작
docker compose restart backend

# 또는 재빌드
docker compose build backend
docker compose up -d backend
```

#### STEP 3: 확인

```bash
# 브라우저에서 접속
open http://localhost
```

---

## 🎯 UI 기능 설명

### 1️⃣ URL 입력
- 타오바오 또는 티몰 상품 URL 입력
- 예시: `https://item.taobao.com/item.htm?id=123456789`

### 2️⃣ 크롤링 시작
- "크롤링 시작" 버튼 클릭
- 20-30초 대기 (실제 크롤링 시간)

### 3️⃣ 결과 확인
페이지에 다음 정보가 순서대로 표시됩니다:
1. **썸네일 이미지** (최대 5장)
2. **상품명** (중국어 + 한국어 번역)
3. **상품 가격** (위안 + 원화)
4. **상품 옵션** (색상, 사이즈 등)
5. **재고 수량**
6. **상세페이지 이미지** (전체)

### 4️⃣ 저장
- "상품 저장" 버튼으로 데이터베이스에 저장

---

## 📂 파일 구조

```
taobao-smartstore/
├── backend/
│   ├── public/              ← 새로 추가!
│   │   └── index.html       ← 프론트엔드 UI
│   └── src/
│       └── server.ts        ← 업데이트됨
├── docker-compose.yml
└── ...
```

---

## 🔧 문제 해결

### 문제 1: "Cannot GET /" 여전히 나옴

```bash
# Backend 로그 확인
docker compose logs backend

# Backend 재시작
docker compose restart backend

# 캐시 클리어 후 재접속
# 브라우저에서 Command + Shift + R
```

### 문제 2: "404 Not Found"

```bash
# index.html이 제대로 복사되었는지 확인
ls -la backend/public/

# 없으면 다시 복사
mkdir -p backend/public
cp ~/Downloads/frontend-index.html backend/public/index.html

# Backend 재시작
docker compose restart backend
```

### 문제 3: 크롤링이 작동하지 않음

```bash
# Redis 큐 확인
docker exec -it taobao_redis redis-cli
> LLEN crawl_queue
> EXIT

# Worker 로그 확인
docker compose logs worker-crawler
```

---

## 🎨 UI 미리보기

### 초기 화면
```
┌─────────────────────────────────────┐
│  🚀 타오바오 상품 크롤러            │
├─────────────────────────────────────┤
│  [타오바오 URL 입력...] [크롤링]   │
├─────────────────────────────────────┤
│  예시: https://item.taobao.com/...  │
└─────────────────────────────────────┘
```

### 결과 화면
```
┌─────────────────────────────────────┐
│  📸 썸네일 이미지                   │
│  [이미지1] [이미지2] [이미지3]     │
├─────────────────────────────────────┤
│  📦 상품명                          │
│  중: 圣诞节礼物 创意礼物           │
│  한: 크리스마스 선물 창의적인 선물 │
├─────────────────────────────────────┤
│  💰 가격                            │
│  타오바오: ¥89.00                  │
│  한국: ₩17,800                      │
├─────────────────────────────────────┤
│  ⚙️ 옵션                            │
│  색상: 빨강, 파랑, 초록             │
│  사이즈: S, M, L, XL                │
├─────────────────────────────────────┤
│  📊 재고: 999개                     │
├─────────────────────────────────────┤
│  🖼️ 상세페이지 이미지              │
│  [상세1] [상세2] [상세3] [상세4]   │
├─────────────────────────────────────┤
│  [다시입력] [상품저장]              │
└─────────────────────────────────────┘
```

---

## 💡 참고사항

### 현재는 데모 모드
- 실제 타오바오 크롤링은 Worker가 처리
- UI는 데모 데이터로 먼저 테스트 가능
- Worker 연동은 다음 단계에서 진행

### 실제 크롤링 연동
Worker의 `taobao_crawler.py`가 Redis 큐를 모니터링하고 있어야 합니다.

---

## 🎉 완료!

이제 브라우저에서 `http://localhost`로 접속하면 깔끔한 UI를 볼 수 있습니다!

크롤링 기능은 Worker가 정상적으로 작동하면 자동으로 연동됩니다.
