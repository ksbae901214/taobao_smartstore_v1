#!/bin/bash

# ===========================================
# 서버 중지
# ===========================================

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo -e "${RED}🛑 서버 중지 중...${NC}"
echo ""

cd "$(dirname "${BASH_SOURCE[0]}")"

docker-compose down 2>/dev/null || docker compose down 2>/dev/null

echo ""
echo -e "${GREEN}✅ 서버가 중지되었습니다${NC}"
echo ""
