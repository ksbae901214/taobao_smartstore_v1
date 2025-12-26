#!/bin/bash

# 🚀 타오바오 스마트스토어 - GCP 프로덕션 배포 스크립트
# 실행: ./scripts/deploy-to-gcp.sh

set -e

echo "🚀 GCP 프로덕션 서버에 배포를 시작합니다..."
echo ""

# GCP 서버 정보
GCP_USER="ksbae901214"
GCP_IP="34.64.37.97"
GCP_DIR="~/taobao_smartstore"

# 1. 로컬 테스트 확인
echo "🧪 1단계: 로컬 환경 테스트 상태 확인"
read -p "로컬에서 충분히 테스트했습니까? (y/n): " test_confirm

if [ "$test_confirm" != "y" ]; then
    echo "❌ 로컬 테스트를 먼저 완료해주세요."
    exit 1
fi

# 2. 현재 브랜치 확인
echo ""
echo "📊 2단계: Git 상태 확인"
current_branch=$(git branch --show-current)
echo "현재 브랜치: $current_branch"

if [ "$current_branch" != "main" ]; then
    echo "⚠️  경고: main 브랜치가 아닙니다!"
    read -p "계속하시겠습니까? (y/n): " branch_confirm
    if [ "$branch_confirm" != "y" ]; then
        exit 1
    fi
fi

# 3. 커밋되지 않은 변경사항 확인
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  경고: 커밋되지 않은 변경사항이 있습니다!"
    git status
    echo ""
    read -p "먼저 커밋하시겠습니까? (y/n): " commit_confirm

    if [ "$commit_confirm" = "y" ]; then
        echo "스크립트를 종료합니다. ./scripts/daily-commit.sh를 먼저 실행하세요."
        exit 1
    fi
fi

# 4. GitHub 푸시 확인
echo ""
echo "📤 3단계: GitHub 푸시 상태 확인"
if git status | grep -q "Your branch is ahead"; then
    echo "⚠️  로컬 커밋이 GitHub에 푸시되지 않았습니다!"
    read -p "지금 푸시하시겠습니까? (y/n): " push_confirm

    if [ "$push_confirm" = "y" ]; then
        git push origin main
        echo "✅ GitHub 푸시 완료"
    else
        echo "❌ 배포를 취소합니다. GitHub에 먼저 푸시해주세요."
        exit 1
    fi
fi

# 5. GCP 서버 접속 및 배포
echo ""
echo "🌐 4단계: GCP 서버에 배포"
echo "서버: $GCP_USER@$GCP_IP"
echo ""

# SSH 명령 실행 (StrictHostKeyChecking=no로 자동 승인)
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$GCP_USER@$GCP_IP" << 'ENDSSH'
    set -e

    echo "📁 프로젝트 디렉토리로 이동..."
    cd ~/taobao_smartstore

    echo "📥 최신 코드 가져오기..."
    git pull origin main

    echo "🔨 Docker 이미지 빌드 및 재시작..."
    docker-compose down
    docker-compose up -d --build

    echo "⏳ 컨테이너 시작 대기 중..."
    sleep 5

    echo "✅ 배포 완료! 컨테이너 상태:"
    docker ps

    echo ""
    echo "📋 최근 로그:"
    docker logs taobao_backend --tail 20
ENDSSH

# 6. 배포 확인
echo ""
echo "🔍 5단계: 배포 확인"
echo "프로덕션 서버 상태 확인 중..."

sleep 3

if curl -s --max-time 10 https://store-daehaeng.com > /dev/null; then
    echo "✅ 서버가 정상적으로 응답합니다!"
else
    echo "⚠️  서버 응답 없음. 로그를 확인하세요."
fi

# 7. 완료
echo ""
echo "========================================="
echo "✅ GCP 프로덕션 배포 완료!"
echo "========================================="
echo "🌐 URL: https://store-daehaeng.com"
echo ""
echo "💡 배포 후 확인사항:"
echo "1. 브라우저에서 https://store-daehaeng.com 접속"
echo "2. 주요 기능 테스트 (상품 등록, 크롤링 등)"
echo "3. 문제 발생시: ssh $GCP_USER@$GCP_IP"
echo "   → docker logs taobao_backend --tail 100"
echo ""
