#!/bin/bash

##############################################
# Taobao SmartStore - GCP 자동 배포 스크립트
# 이 스크립트를 GCP VM에서 실행하세요
##############################################

set -e  # 에러 발생 시 즉시 중단

echo "=========================================="
echo "🚀 Taobao SmartStore GCP 배포 시작"
echo "=========================================="

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 시스템 업데이트
echo -e "\n${YELLOW}[1/8]${NC} 시스템 패키지 업데이트 중..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# 2. Docker 설치
echo -e "\n${YELLOW}[2/8]${NC} Docker 설치 중..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}✓ Docker 설치 완료${NC}"
else
    echo -e "${GREEN}✓ Docker 이미 설치됨${NC}"
fi

# 3. Docker Compose 설치
echo -e "\n${YELLOW}[3/8]${NC} Docker Compose 설치 중..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✓ Docker Compose 설치 완료${NC}"
else
    echo -e "${GREEN}✓ Docker Compose 이미 설치됨${NC}"
fi

# 4. Git 설치 (선택사항)
echo -e "\n${YELLOW}[4/8]${NC} Git 설치 중..."
if ! command -v git &> /dev/null; then
    sudo apt-get install -y git
    echo -e "${GREEN}✓ Git 설치 완료${NC}"
else
    echo -e "${GREEN}✓ Git 이미 설치됨${NC}"
fi

# 5. 프로젝트 디렉토리 생성
echo -e "\n${YELLOW}[5/8]${NC} 프로젝트 디렉토리 설정 중..."
PROJECT_DIR="$HOME/taobao_smartstore"

if [ -d "$PROJECT_DIR" ]; then
    echo -e "${YELLOW}⚠ 기존 프로젝트 디렉토리가 있습니다. 백업 중...${NC}"
    sudo mv "$PROJECT_DIR" "$PROJECT_DIR.backup.$(date +%Y%m%d_%H%M%S)"
fi

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"
echo -e "${GREEN}✓ 프로젝트 디렉토리 생성: $PROJECT_DIR${NC}"

# 6. 필요한 디렉토리 생성
echo -e "\n${YELLOW}[6/8]${NC} 스토리지 디렉토리 생성 중..."
mkdir -p storage/images
mkdir -p certbot/conf
mkdir -p certbot/www
chmod -R 755 storage
echo -e "${GREEN}✓ 디렉토리 생성 완료${NC}"

# 7. 방화벽 설정 (GCP 방화벽은 콘솔에서 이미 설정)
echo -e "\n${YELLOW}[7/8]${NC} UFW 방화벽 설정 중..."
if command -v ufw &> /dev/null; then
    sudo ufw --force enable
    sudo ufw allow 22/tcp    # SSH
    sudo ufw allow 80/tcp    # HTTP
    sudo ufw allow 443/tcp   # HTTPS
    sudo ufw status
    echo -e "${GREEN}✓ 방화벽 설정 완료${NC}"
else
    echo -e "${YELLOW}⚠ UFW가 설치되어 있지 않습니다. GCP 방화벽 규칙으로 대체합니다.${NC}"
fi

# 8. 완료 메시지
echo -e "\n=========================================="
echo -e "${GREEN}✅ GCP 서버 준비 완료!${NC}"
echo -e "=========================================="
echo ""
echo -e "${YELLOW}다음 단계:${NC}"
echo "1. 로컬에서 프로젝트 파일을 이 서버로 전송하세요:"
echo -e "   ${GREEN}scp -r /Users/macbook14/Desktop/taobao_smartstore_v1/* USERNAME@GCP_IP:~/taobao_smartstore/${NC}"
echo ""
echo "2. 또는 Git을 사용하세요:"
echo -e "   ${GREEN}git clone YOUR_REPO_URL ~/taobao_smartstore${NC}"
echo ""
echo "3. 프로젝트 디렉토리로 이동:"
echo -e "   ${GREEN}cd ~/taobao_smartstore${NC}"
echo ""
echo "4. Docker Compose로 실행:"
echo -e "   ${GREEN}docker-compose up -d --build${NC}"
echo ""
echo "5. SSL 인증서 설정:"
echo -e "   ${GREEN}./setup-ssl.sh${NC}"
echo ""
echo -e "${YELLOW}현재 디렉토리: $PROJECT_DIR${NC}"
echo "=========================================="
