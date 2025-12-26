# 🚀 타오바오 스마트스토어 - 프로젝트 상태

**최종 업데이트**: 2024-12-24
**작업 컴퓨터**: 맥북 (로컬 개발)

---

## 📌 프로젝트 개요

- **저장소**: https://github.com/ksbae901214/taobao_smartstore_v1 (Private)
- **로컬 경로**: `/Users/kyusik/taobao-smartstore`
- **도메인**: https://store-daehaeng.com
- **GCP VM IP**: 34.64.37.97
- **목적**: 타오바오 상품 크롤링 → 네이버 스마트스토어 자동 업로드

---

## 🏗️ 기술 스택

- **Backend**: Node.js 18 + Express + TypeScript
- **Database**: Redis 7 (PostgreSQL 제거됨)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Chrome Extension**: Manifest v3
- **배포**: Docker Compose
- **SSL**: Cloudflare Tunnel (Named Tunnel: taobao-store)

---

## ✅ 최근 완료된 작업 (2024-12-24)

### 1. 옵션 가격 표시 수정
- 파일: `backend/public/index.html:2804, 5705`
- 수정: `price_krw` 우선 표시, 0원도 표시 가능하게 수정

### 2. 이미지 업로드 순서 최적화
- 파일: `backend/src/server.ts:1245-1268`
- 변경: 메인 이미지 → 상세 이미지 → 옵션 이미지 순으로 변경
- 결과: 상세 이미지 12개 전부 업로드 가능

### 3. WebP 이미지 자동 변환
- 파일: `backend/src/server.ts:1176-1184`
- 추가: URL 확장자 `.webp` 감지 및 JPEG 변환

### 4. 상세페이지 구매옵션에 이미지 추가
- 파일: `backend/src/server.ts:937-971`
- 기능: 옵션 이미지가 있으면 60x60 썸네일과 함께 표시

### 5. 네이버 API 상품고시정보 타입 수정
- 파일: `backend/src/server.ts:1462-1464`
- 수정: `'ETC'` → `'OTHERS'` (네이버 API 정식 enum 값)
- 수정: `etc:` → `others:` 필드명도 변경

### 6. 카테고리 선택 모달 스크롤 수정
- 파일: `backend/public/index.html:1386-1407`
- 수정: flexbox 높이 설정으로 스크롤 정상 작동

### 7. 테이블 컬럼 변경
- 파일: `backend/src/server.ts:512-514`, `backend/public/index.html:1260-1261, 2650-2689`
- 변경: "마켓명/유입일" → "스토어업로드 일자/상태"
- 추가: `naver_uploaded_at`, `naver_product_status` 필드

---

## 🔑 환경 설정

### Docker Compose (docker-compose.yml)

```yaml
environment:
  - NODE_ENV=development
  - PORT=3000
  - REDIS_URL=redis://redis:6379
  - NAVER_CLIENT_ID=3BYV4foYrabQwiM7GZtLfr
  - NAVER_CLIENT_SECRET=$$2a$$04$$IezTXxCwI/e3RJaQ6Ya7J.
  - BASE_URL=https://store-daehaeng.com
```

### Cloudflare Tunnel 설정

**Named Tunnel**: `taobao-store`
- 도메인: `store-daehaeng.com`
- 서비스: `http://localhost:3000`

**실행 방법**:
```bash
# 백그라운드 실행
nohup cloudflared tunnel run taobao-store > ~/cloudflared.log 2>&1 &

# 로그 확인
tail -f ~/cloudflared.log

# 종료
pkill cloudflared
```

**로그인 필요시**:
```bash
cloudflared tunnel login
```

---

## 🐛 알려진 이슈 및 해결 방법

### 1. Cloudflare Tunnel 연결 실패
**증상**: `getaddrinfo ENOTFOUND` 에러
**원인**: Tunnel 프로세스 종료됨
**해결**:
```bash
cloudflared tunnel run taobao-store
```

### 2. Docker 환경변수 변경 후 적용 안됨
**증상**: `docker restart`로 재시작해도 BASE_URL이 옛날 값
**해결**:
```bash
docker-compose down && docker-compose up -d
```

### 3. 네이버 상품 등록 실패 (productInfoProvidedNoticeType)
**증상**: `NotValidEnum` 에러
**원인**: 'ETC' 값 사용 (존재하지 않음)
**해결**: 'OTHERS'로 변경 (이미 수정됨)

---

## 📂 주요 파일 구조

```
taobao-smartstore/
├── backend/
│   ├── src/server.ts              # 메인 백엔드 (1,900+ 줄)
│   ├── public/index.html          # 프론트엔드 (7,000+ 줄)
│   ├── dist/server.js             # 컴파일된 백엔드
│   └── storage/                   # 크롤링한 이미지 저장
├── docker-compose.yml             # 서비스 오케스트레이션
├── nginx/nginx.conf               # Nginx 설정
├── .env                           # 환경변수 (gitignore)
└── PROJECT_STATE.md               # 이 파일
```

---

## 💡 자주 사용하는 명령어

### 로컬 개발 (맥북)

```bash
# 프로젝트 경로로 이동
cd /Users/kyusik/taobao-smartstore

# Docker 재시작
docker-compose down && docker-compose up -d

# 백엔드 빌드
npm --prefix ./backend run build

# 백엔드 배포
docker cp ./backend/dist/server.js taobao_backend:/app/dist/server.js
docker restart taobao_backend

# 프론트엔드 배포
docker cp ./backend/public/index.html taobao_backend:/app/public/index.html

# 로그 확인
docker logs taobao_backend --tail 100

# Redis 데이터 확인
docker exec taobao_redis redis-cli KEYS '*'
```

### GCP 프로덕션 서버

```bash
# SSH 접속
gcloud compute ssh ksbae901214@instance-1 --zone=asia-northeast3-a

# 프로젝트 디렉토리로 이동
cd ~/taobao_smartstore

# 최신 코드 받기
git pull origin main

# 서비스 재시작
docker-compose restart

# 로그 확인
docker logs taobao_backend --tail 50
```

---

## 🔄 두 컴퓨터 간 작업 전환 방법

### 맥북 → 다른 컴퓨터

```bash
# 1. 맥북에서 작업 후 커밋
git add .
git commit -m "작업 내용: ..."
git push origin main

# 2. 이 파일(PROJECT_STATE.md) 업데이트
# "최근 완료된 작업" 섹션에 내용 추가

# 3. 다시 커밋
git add PROJECT_STATE.md
git commit -m "프로젝트 상태 업데이트"
git push origin main
```

### 다른 컴퓨터 → 맥북

```bash
# 1. 다른 컴퓨터에서 최신 코드 받기
git pull origin main

# 2. PROJECT_STATE.md 확인
cat PROJECT_STATE.md

# 3. Docker 재시작
docker-compose down && docker-compose up -d
```

---

## 📝 다음 작업 예정

- [ ] GCP 서버와 로컬 환경 동기화
- [ ] Chrome Extension 개선
- [ ] 네이버 상품 대량 업로드 기능
- [ ] 옵션명 자동 번역 개선

---

## 🆘 문제 발생 시 체크리스트

1. ✅ Cloudflare Tunnel 실행 중인지 확인
2. ✅ Docker 컨테이너 모두 실행 중인지 확인 (`docker ps`)
3. ✅ 환경변수 올바른지 확인 (`docker exec taobao_backend printenv`)
4. ✅ 최신 코드인지 확인 (`git pull`)
5. ✅ 빌드 후 배포했는지 확인 (`npm run build` → `docker cp`)

---

**마지막 업데이트**: 2024-12-24 19:00 KST
**작업자**: Claude Code + kyusik
