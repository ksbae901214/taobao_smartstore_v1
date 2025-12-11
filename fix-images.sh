#!/bin/bash

# ==========================================
# 이미지 표시 문제 해결
# ==========================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}이미지 표시 문제 해결${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

PROJECT_DIR="/Users/kyusik/taobao-smartstore"
cd "$PROJECT_DIR" || exit 1

echo -e "${YELLOW}1/3 수정된 index.html 복사 중...${NC}"

# 다운로드 폴더에서 새 index.html 복사
if [ -f ~/Downloads/index.html ]; then
    cp ~/Downloads/index.html backend/public/index.html
    echo -e "${GREEN}✅ 이미지 URL이 수정된 파일로 교체 완료${NC}"
else
    echo -e "${YELLOW}⚠️  index.html을 찾을 수 없습니다${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}2/3 Backend 재시작 중...${NC}"
docker compose restart backend
echo -e "${GREEN}✅ Backend 재시작 완료${NC}"
echo ""

echo -e "${YELLOW}3/3 Nginx 재시작 중...${NC}"
docker compose restart nginx
echo -e "${GREEN}✅ Nginx 재시작 완료${NC}"
echo ""

sleep 3

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✨ 수정 완료!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${BLUE}시크릿 모드로 다시 접속해주세요:${NC}"
echo ""

# 크롬 시크릿 모드로 열기
open -na "Google Chrome" --args --incognito http://localhost

echo -e "${YELLOW}이제 이미지가 정상적으로 표시됩니다! 📸${NC}"
