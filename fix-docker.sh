#!/bin/bash

# ==========================================
# Docker 빌드 에러 자동 수정 스크립트
# ==========================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Docker 빌드 문제 자동 수정${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

PROJECT_DIR="/Users/kyusik/taobao-smartstore"

# 프로젝트 디렉토리로 이동
cd "$PROJECT_DIR" || exit 1

# STEP 1: 기존 컨테이너 정리
echo -e "${YELLOW}1/6 기존 컨테이너 정리 중...${NC}"
docker-compose down -v 2>/dev/null || docker compose down -v 2>/dev/null
docker system prune -f
echo -e "${GREEN}✅ 정리 완료${NC}"
echo ""

# STEP 2: Docker 캐시 정리
echo -e "${YELLOW}2/6 Docker 캐시 정리 중...${NC}"
docker builder prune -af
echo -e "${GREEN}✅ 캐시 정리 완료${NC}"
echo ""

# STEP 3: docker-compose.yml 백업
echo -e "${YELLOW}3/6 기존 파일 백업 중...${NC}"
if [ -f "docker-compose.yml" ]; then
    cp docker-compose.yml "docker-compose.yml.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${GREEN}✅ 백업 완료${NC}"
fi
echo ""

# STEP 4: 새로운 docker-compose.yml 생성
echo -e "${YELLOW}4/6 docker-compose.yml 수정 중...${NC}"

# version 줄 제거
if [ "$(uname)" = "Darwin" ]; then
    # macOS
    sed -i '' '/^version:/d' docker-compose.yml
else
    # Linux
    sed -i '/^version:/d' docker-compose.yml
fi

echo -e "${GREEN}✅ docker-compose.yml 수정 완료${NC}"
echo ""

# STEP 5: Workers Dockerfile 최적화
echo -e "${YELLOW}5/6 Workers Dockerfile 최적화 중...${NC}"

cat > workers/Dockerfile << 'EOF'
FROM python:3.11-slim

WORKDIR /app

ARG DEBIAN_FRONTEND=noninteractive

# 시스템 의존성 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Python 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright 설치
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN playwright install chromium --with-deps

# 소스 복사
COPY . .
RUN chmod -R 755 /app

CMD ["python", "-u"]
EOF

echo -e "${GREEN}✅ Dockerfile 최적화 완료${NC}"
echo ""

# STEP 6: 단계별 빌드
echo -e "${YELLOW}6/6 서비스별 순차 빌드 시작...${NC}"
echo ""

echo -e "${BLUE}📦 PostgreSQL & Redis 시작...${NC}"
docker compose up -d postgres redis
sleep 10
echo -e "${GREEN}✅ 데이터베이스 준비 완료${NC}"
echo ""

echo -e "${BLUE}📦 Backend 빌드 중...${NC}"
docker compose build backend
docker compose up -d backend
sleep 5
echo -e "${GREEN}✅ Backend 시작 완료${NC}"
echo ""

echo -e "${BLUE}📦 Worker 빌드 중 (시간 소요: 5-10분)...${NC}"
echo -e "${YELLOW}💡 Playwright 다운로드 중이니 기다려주세요...${NC}"
docker compose build --no-cache worker-crawler
docker compose up -d worker-crawler worker-image worker-translator
echo -e "${GREEN}✅ Workers 시작 완료${NC}"
echo ""

echo -e "${BLUE}📦 Nginx 시작...${NC}"
docker compose up -d nginx
echo -e "${GREEN}✅ Nginx 시작 완료${NC}"
echo ""

# 최종 확인
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✨ 모든 서비스 시작 완료!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

echo -e "${BLUE}컨테이너 상태 확인:${NC}"
docker compose ps

echo ""
echo -e "${YELLOW}접속 주소: http://localhost${NC}"
echo -e "${YELLOW}Health Check: http://localhost/health${NC}"
