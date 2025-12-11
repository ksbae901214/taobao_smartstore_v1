#!/bin/bash

# ==========================================
# 프론트엔드 UI 추가 배포 스크립트
# ==========================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}프론트엔드 UI 배포${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

PROJECT_DIR="/Users/kyusik/taobao-smartstore"

cd "$PROJECT_DIR" || exit 1

# STEP 1: public 디렉토리 생성
echo -e "${YELLOW}1/4 public 폴더 생성 중...${NC}"
mkdir -p backend/public
echo -e "${GREEN}✅ 완료${NC}"
echo ""

# STEP 2: index.html 복사
echo -e "${YELLOW}2/4 프론트엔드 파일 복사 중...${NC}"

# 다운로드한 frontend-index.html을 backend/public/index.html로 복사
if [ -f "frontend-index.html" ]; then
    cp frontend-index.html backend/public/index.html
    echo -e "${GREEN}✅ frontend-index.html → backend/public/index.html${NC}"
elif [ -f ~/Downloads/frontend-index.html ]; then
    cp ~/Downloads/frontend-index.html backend/public/index.html
    echo -e "${GREEN}✅ Downloads에서 복사 완료${NC}"
else
    echo -e "${YELLOW}⚠️  frontend-index.html을 찾을 수 없습니다${NC}"
    echo -e "${YELLOW}   직접 backend/public/index.html에 복사해주세요${NC}"
fi
echo ""

# STEP 3: server.ts 업데이트
echo -e "${YELLOW}3/4 Backend 서버 업데이트 중...${NC}"

# backend-server-updated.ts가 있으면 사용
if [ -f "backend-server-updated.ts" ]; then
    cp backend-server-updated.ts backend/src/server.ts
    echo -e "${GREEN}✅ server.ts 업데이트 완료${NC}"
elif [ -f ~/Downloads/backend-server-updated.ts ]; then
    cp ~/Downloads/backend-server-updated.ts backend/src/server.ts
    echo -e "${GREEN}✅ server.ts 업데이트 완료${NC}"
else
    echo -e "${YELLOW}⚠️  backend-server-updated.ts를 찾을 수 없습니다${NC}"
fi
echo ""

# STEP 4: Backend 재시작
echo -e "${YELLOW}4/4 Backend 컨테이너 재시작 중...${NC}"
docker compose restart backend
echo -e "${GREEN}✅ Backend 재시작 완료${NC}"
echo ""

# 완료 메시지
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✨ 배포 완료!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${BLUE}접속 주소:${NC}"
echo -e "  메인 페이지: ${YELLOW}http://localhost${NC}"
echo -e "  Health Check: ${YELLOW}http://localhost/health${NC}"
echo ""
echo -e "${BLUE}브라우저를 열어서 확인하세요!${NC}"

# 브라우저 자동 열기
sleep 2
open http://localhost
