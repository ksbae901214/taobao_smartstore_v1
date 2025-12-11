#!/bin/bash

# ==========================================
# 완전한 크롤링 UI로 업데이트
# ==========================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}타오바오 크롤링 UI 업데이트${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

PROJECT_DIR="/Users/kyusik/taobao-smartstore"
cd "$PROJECT_DIR" || exit 1

echo -e "${YELLOW}1/3 새로운 UI 파일 복사 중...${NC}"

# 다운로드 폴더에서 index.html 찾기
if [ -f ~/Downloads/index.html ]; then
    cp ~/Downloads/index.html backend/public/index.html
    echo -e "${GREEN}✅ Downloads/index.html → backend/public/index.html${NC}"
elif [ -f index.html ]; then
    cp index.html backend/public/index.html
    echo -e "${GREEN}✅ 현재 디렉토리에서 복사 완료${NC}"
else
    echo -e "${YELLOW}⚠️  index.html을 찾을 수 없습니다${NC}"
    echo -e "${YELLOW}   수동으로 backend/public/index.html을 교체해주세요${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}2/3 Backend 재시작 중...${NC}"
docker compose restart backend
echo -e "${GREEN}✅ Backend 재시작 완료${NC}"
echo ""

echo -e "${YELLOW}3/3 브라우저 캐시 클리어 안내${NC}"
echo -e "${BLUE}브라우저에서 다음 키를 눌러주세요:${NC}"
echo -e "  ${GREEN}Mac: Command(⌘) + Shift + R${NC}"
echo ""

sleep 3

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✨ 업데이트 완료!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${BLUE}접속 주소: ${YELLOW}http://localhost${NC}"
echo ""

# 브라우저 열기
open http://localhost
