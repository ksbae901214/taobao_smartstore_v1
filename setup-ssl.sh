#!/bin/bash

##############################################
# SSL 인증서 자동 설정 스크립트 (Let's Encrypt)
##############################################

set -e

DOMAIN="store-daehaeng.com"
EMAIL="your-email@example.com"  # 여기에 이메일 주소 입력!

echo "=========================================="
echo "🔒 SSL 인증서 설정 (Let's Encrypt)"
echo "=========================================="

# 색상
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 이메일 확인
if [ "$EMAIL" = "your-email@example.com" ]; then
    echo -e "${RED}❌ 에러: 이메일 주소를 설정해주세요!${NC}"
    echo "setup-ssl.sh 파일을 열어서 EMAIL 변수를 수정하세요."
    exit 1
fi

# Certbot 설치
echo -e "\n${YELLOW}[1/4]${NC} Certbot 설치 중..."
if ! command -v certbot &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y certbot
    echo -e "${GREEN}✓ Certbot 설치 완료${NC}"
else
    echo -e "${GREEN}✓ Certbot 이미 설치됨${NC}"
fi

# Nginx 임시 중지
echo -e "\n${YELLOW}[2/4]${NC} Nginx 컨테이너 임시 중지..."
docker stop taobao_nginx || true

# SSL 인증서 발급
echo -e "\n${YELLOW}[3/4]${NC} SSL 인증서 발급 중..."
echo "도메인: $DOMAIN, www.$DOMAIN"
echo "이메일: $EMAIL"

sudo certbot certonly --standalone \
    --preferred-challenges http \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

# 인증서 파일 복사
echo -e "\n${YELLOW}[4/4]${NC} 인증서 파일 복사 중..."
sudo cp -r /etc/letsencrypt/* ./certbot/conf/
sudo chown -R $USER:$USER ./certbot/conf

# Nginx 설정 업데이트
echo -e "\n${YELLOW}Nginx SSL 설정 업데이트 중...${NC}"

cat > ./nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:3000;
    }

    client_max_body_size 100M;

    # HTTP -> HTTPS 리디렉션
    server {
        listen 80;
        server_name store-daehaeng.com www.store-daehaeng.com;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS 서버
    server {
        listen 443 ssl http2;
        server_name store-daehaeng.com www.store-daehaeng.com;

        ssl_certificate /etc/letsencrypt/live/store-daehaeng.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/store-daehaeng.com/privkey.pem;

        # SSL 보안 설정
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        location / {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        location /api {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location /images {
            alias /usr/share/nginx/html/storage/images;
            expires 30d;
            add_header Cache-Control "public, immutable";
        }

        location /health {
            access_log off;
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF

echo -e "${GREEN}✓ Nginx SSL 설정 완료${NC}"

# Docker Compose 재시작
echo -e "\n${YELLOW}Docker Compose 재시작 중...${NC}"
docker-compose up -d

echo -e "\n=========================================="
echo -e "${GREEN}✅ SSL 인증서 설정 완료!${NC}"
echo -e "=========================================="
echo ""
echo "🌐 웹사이트 접속:"
echo -e "   ${GREEN}https://store-daehaeng.com${NC}"
echo -e "   ${GREEN}https://www.store-daehaeng.com${NC}"
echo ""
echo "📝 SSL 인증서 자동 갱신:"
echo "   인증서는 90일마다 갱신이 필요합니다."
echo "   다음 명령어로 자동 갱신을 설정하세요:"
echo -e "   ${GREEN}sudo certbot renew --dry-run${NC}"
echo ""
echo "   Cron job 추가:"
echo -e "   ${GREEN}sudo crontab -e${NC}"
echo "   다음 줄을 추가:"
echo "   0 0 1 * * certbot renew --quiet --deploy-hook 'docker-compose restart nginx'"
echo "=========================================="
