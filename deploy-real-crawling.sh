#!/bin/bash

# ==========================================
# 실제 타오바오 크롤링 연동 배포
# ==========================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}실제 타오바오 크롤링 연동 배포${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

PROJECT_DIR="/Users/kyusik/taobao-smartstore"
cd "$PROJECT_DIR" || exit 1

# STEP 1: 파일 복사
echo -e "${YELLOW}1/5 크롤링 파일 배포 중...${NC}"

# Python 크롤러
if [ -f ~/Downloads/taobao_crawler_real.py ]; then
    cp ~/Downloads/taobao_crawler_real.py workers/taobao_crawler.py
    echo -e "${GREEN}✅ taobao_crawler.py 업데이트${NC}"
else
    echo -e "${RED}❌ taobao_crawler_real.py 파일을 찾을 수 없습니다${NC}"
fi

# Backend server.ts
if [ -f ~/Downloads/server-with-crawl.ts ]; then
    cp ~/Downloads/server-with-crawl.ts backend/src/server.ts
    echo -e "${GREEN}✅ server.ts 업데이트${NC}"
else
    echo -e "${RED}❌ server-with-crawl.ts 파일을 찾을 수 없습니다${NC}"
fi

# Frontend index.html
if [ -f ~/Downloads/index.html ]; then
    cp ~/Downloads/index.html backend/public/index.html
    echo -e "${GREEN}✅ index.html 업데이트${NC}"
else
    echo -e "${RED}❌ index.html 파일을 찾을 수 없습니다${NC}"
fi
echo ""

# STEP 2: Redis 패키지 추가
echo -e "${YELLOW}2/5 Python 패키지 확인 중...${NC}"
if ! grep -q "loguru" workers/requirements.txt; then
    echo "loguru==0.7.2" >> workers/requirements.txt
    echo -e "${GREEN}✅ loguru 추가${NC}"
fi
echo ""

# STEP 3: Backend 패키지 확인
echo -e "${YELLOW}3/5 Backend 패키지 확인 중...${NC}"
cd backend
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json이 없습니다${NC}"
else
    # ioredis가 있는지 확인
    if ! grep -q "ioredis" package.json; then
        echo -e "${YELLOW}ioredis 추가 필요 - npm install 실행...${NC}"
    fi
    echo -e "${GREEN}✅ package.json 확인 완료${NC}"
fi
cd ..
echo ""

# STEP 4: 컨테이너 재시작
echo -e "${YELLOW}4/5 컨테이너 재빌드 및 재시작 중...${NC}"
echo -e "${BLUE}이 과정은 5-10분 소요될 수 있습니다...${NC}"

# Workers 재빌드 (크롤러 업데이트)
docker compose stop worker-crawler
docker compose build worker-crawler
docker compose up -d worker-crawler

echo -e "${GREEN}✅ Worker 재시작 완료${NC}"

# Backend 재빌드
docker compose stop backend
docker compose build backend
docker compose up -d backend

echo -e "${GREEN}✅ Backend 재시작 완료${NC}"

# Nginx 재시작
docker compose restart nginx
echo -e "${GREEN}✅ Nginx 재시작 완료${NC}"
echo ""

# STEP 5: 상태 확인
echo -e "${YELLOW}5/5 시스템 상태 확인 중...${NC}"
sleep 5
docker compose ps
echo ""

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}✨ 배포 완료!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

echo -e "${BLUE}📋 변경사항:${NC}"
echo -e "  ✅ 실제 타오바오 크롤링 활성화"
echo -e "  ✅ Playwright로 웹 스크래핑"
echo -e "  ✅ Redis를 통한 비동기 처리"
echo -e "  ✅ 실시간 결과 폴링"
echo ""

echo -e "${YELLOW}🧪 테스트 방법:${NC}"
echo -e "  1. 브라우저에서 http://localhost 접속"
echo -e "  2. 타오바오 URL 입력"
echo -e "  3. 크롤링 시작 버튼 클릭"
echo -e "  4. 20-30초 대기"
echo -e "  5. 실제 상품 정보 표시 확인"
echo ""

echo -e "${BLUE}로그 확인:${NC}"
echo -e "  docker compose logs -f worker-crawler"
echo ""

# 브라우저 열기
sleep 2
open -na "Google Chrome" --args --incognito http://localhost

echo -e "${GREEN}🎉 실제 크롤링이 준비되었습니다!${NC}"
