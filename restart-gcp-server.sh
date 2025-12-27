#!/bin/bash

##############################################
# GCP 프로덕션 서버 재시작 스크립트
##############################################

set -e

echo "=========================================="
echo "🚀 GCP 프로덕션 서버 재시작"
echo "=========================================="

GCP_USER="ksbae901214"
GCP_IP="34.64.37.97"
PROJECT_DIR="taobao_smartstore"

echo ""
echo "📡 GCP 서버에 접속 중..."
echo "   사용자: $GCP_USER"
echo "   IP: $GCP_IP"
echo ""

# SSH로 GCP 서버 접속 및 명령 실행
ssh -t ${GCP_USER}@${GCP_IP} << 'ENDSSH'

echo "=========================================="
echo "🔍 현재 서버 상태 확인"
echo "=========================================="

# 프로젝트 디렉토리 찾기
if [ -d ~/taobao_smartstore ]; then
    cd ~/taobao_smartstore
elif [ -d ~/taobao_smartstore.backup.* ]; then
    cd ~/taobao_smartstore.backup.*
else
    echo "❌ 프로젝트 디렉토리를 찾을 수 없습니다!"
    exit 1
fi

echo "📂 현재 위치: $(pwd)"
echo ""

# Docker 컨테이너 상태 확인
echo "🐳 Docker 컨테이너 상태:"
docker ps -a

echo ""
echo "=========================================="
echo "🔄 서비스 재시작 중..."
echo "=========================================="

# Docker Compose 재시작
docker-compose down
docker-compose up -d

echo ""
echo "⏳ 서비스 시작 대기 중 (5초)..."
sleep 5

echo ""
echo "=========================================="
echo "✅ 서비스 상태 확인"
echo "=========================================="

# 컨테이너 상태 확인
docker ps

echo ""
echo "📋 백엔드 로그 (최근 20줄):"
docker logs taobao_backend --tail 20

echo ""
echo "=========================================="
echo "🎉 재시작 완료!"
echo "=========================================="
echo ""
echo "🌐 웹사이트 확인: https://store-daehaeng.com"
echo ""

ENDSSH

echo ""
echo "=========================================="
echo "✅ 재시작 스크립트 실행 완료"
echo "=========================================="
echo ""
echo "브라우저에서 https://store-daehaeng.com 접속해서 확인하세요!"
echo ""
