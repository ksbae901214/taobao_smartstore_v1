#!/bin/bash

# ===========================================
# 빠른 재시작 (빌드 없이)
# ===========================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}🔄 빠른 재시작 중...${NC}"
echo ""

cd "$(dirname "${BASH_SOURCE[0]}")"

# 재시작
docker-compose restart 2>/dev/null || docker compose restart 2>/dev/null

sleep 3

# 상태 확인
echo ""
docker-compose ps 2>/dev/null || docker compose ps 2>/dev/null
echo ""

# Health Check
response=$(curl -s http://localhost:3000/health 2>/dev/null)
if [ ! -z "$response" ]; then
    echo -e "${GREEN}✅ 서버 정상 작동 중!${NC}"
else
    echo -e "${YELLOW}⚠️ 서버 시작 중... 잠시만 기다려주세요${NC}"
fi

echo ""
echo -e "${GREEN}📍 http://localhost:3000 에서 확인하세요${NC}"
echo ""
