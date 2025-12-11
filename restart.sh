#!/bin/bash

# ===========================================
# 타오바오 스마트스토어 시스템 - 쉬운 재시작 스크립트
# ===========================================

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  🛒 타오바오 → 스마트스토어 시스템${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# 현재 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}📂 작업 디렉토리: ${SCRIPT_DIR}${NC}"
echo ""

# 1단계: 기존 컨테이너 중지
echo -e "${YELLOW}[1/4] 🛑 기존 컨테이너 중지 중...${NC}"
docker-compose down 2>/dev/null || docker compose down 2>/dev/null
echo -e "${GREEN}✅ 기존 컨테이너 중지 완료${NC}"
echo ""

# 2단계: 이미지 재빌드
echo -e "${YELLOW}[2/4] 🔨 도커 이미지 재빌드 중...${NC}"
docker-compose build --no-cache 2>/dev/null || docker compose build --no-cache 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 이미지 빌드 완료${NC}"
else
    echo -e "${RED}❌ 이미지 빌드 실패${NC}"
    echo -e "${YELLOW}💡 docker-compose.yml 파일이 있는지 확인해주세요${NC}"
    exit 1
fi
echo ""

# 3단계: 컨테이너 시작
echo -e "${YELLOW}[3/4] 🚀 서비스 시작 중...${NC}"
docker-compose up -d 2>/dev/null || docker compose up -d 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 서비스 시작 완료${NC}"
else
    echo -e "${RED}❌ 서비스 시작 실패${NC}"
    exit 1
fi
echo ""

# 4단계: 상태 확인
echo -e "${YELLOW}[4/4] 📊 서비스 상태 확인 중...${NC}"
sleep 5  # 서비스 시작 대기

# 컨테이너 상태 확인
echo ""
echo -e "${BLUE}🐳 컨테이너 상태:${NC}"
docker-compose ps 2>/dev/null || docker compose ps 2>/dev/null
echo ""

# Health Check
echo -e "${BLUE}💚 서버 상태 확인:${NC}"
for i in 1 2 3 4 5; do
    response=$(curl -s http://localhost:3000/health 2>/dev/null)
    if [ ! -z "$response" ]; then
        echo -e "${GREEN}✅ 백엔드 서버 정상 작동 중!${NC}"
        break
    fi
    if [ $i -eq 5 ]; then
        echo -e "${YELLOW}⚠️ 서버 응답 대기 중... (정상 시작까지 잠시 걸릴 수 있습니다)${NC}"
    fi
    sleep 2
done

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ✅ 재시작 완료!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}📍 접속 주소:${NC}"
echo -e "   • 메인 페이지: ${GREEN}http://localhost:3000${NC}"
echo -e "   • API 상태:    ${GREEN}http://localhost:3000/health${NC}"
echo ""
echo -e "${YELLOW}💡 크롬 확장 프로그램에서 서버 주소를 http://localhost:3000 으로 설정하세요!${NC}"
echo ""
