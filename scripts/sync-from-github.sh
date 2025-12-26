#!/bin/bash

# 🔄 타오바오 스마트스토어 - GitHub에서 최신 코드 동기화
# 실행: ./scripts/sync-from-github.sh

set -e

echo "🔄 GitHub에서 최신 코드를 가져옵니다..."
echo ""

# 프로젝트 루트로 이동
cd "$(dirname "$0")/.."

# 1. 현재 상태 확인
echo "📊 1단계: 현재 로컬 상태 확인"

if ! git diff-index --quiet HEAD --; then
    echo "⚠️  경고: 커밋되지 않은 변경사항이 있습니다!"
    git status
    echo ""
    read -p "변경사항을 임시 저장(stash)하시겠습니까? (y/n): " stash_confirm

    if [ "$stash_confirm" = "y" ]; then
        stash_message="Auto stash on $(date +%Y-%m-%d_%H:%M:%S)"
        git stash save "$stash_message"
        echo "✅ 변경사항이 임시 저장되었습니다: $stash_message"
        echo "💡 복원하려면: git stash pop"
    else
        echo "❌ 동기화를 취소합니다."
        exit 1
    fi
fi

# 2. 최신 코드 가져오기
echo ""
echo "📥 2단계: GitHub에서 최신 코드 가져오기"
git pull origin main

# 3. PROJECT_STATE.md 확인
echo ""
echo "📄 3단계: 프로젝트 상태 확인"

if [ -f "PROJECT_STATE.md" ]; then
    echo "========================================="
    echo "📋 최근 업데이트 내역"
    echo "========================================="

    # 최종 업데이트 날짜와 최근 작업 표시
    grep -A 3 "최종 업데이트" PROJECT_STATE.md | head -5
    echo ""
    grep -A 20 "최근 완료된 작업" PROJECT_STATE.md | head -25

    echo ""
    echo "========================================="
else
    echo "⚠️  PROJECT_STATE.md 파일이 없습니다."
fi

# 4. Docker 재시작 여부 확인
echo ""
read -p "🐳 Docker 컨테이너를 재시작하시겠습니까? (y/n): " docker_confirm

if [ "$docker_confirm" = "y" ]; then
    echo "🔨 Docker 재시작 중..."
    docker-compose down
    docker-compose up -d

    echo "⏳ 컨테이너 시작 대기 중..."
    sleep 5

    echo "✅ Docker 재시작 완료!"
    docker ps
fi

# 5. 완료
echo ""
echo "========================================="
echo "✅ 동기화 완료!"
echo "========================================="
echo ""
echo "💡 다음 단계:"
echo "1. Claude Code 열기 (VSCode)"
echo "2. Claude에게 다음 메시지 보내기:"
echo ""
echo "   'PROJECT_STATE.md 파일을 읽고 최근 작업 내용을 요약해줘'"
echo ""
echo "3. 로컬 테스트: http://localhost"
echo ""
