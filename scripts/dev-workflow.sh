#!/bin/bash

# 🎯 타오바오 스마트스토어 - 개발 워크플로우 통합 스크립트
# 실행: ./scripts/dev-workflow.sh

clear

cat << "EOF"
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 타오바오 스마트스토어 - 개발 워크플로우 메뉴           ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
EOF

echo ""
echo "📋 작업을 선택하세요:"
echo ""
echo "  1️⃣  일일 작업 마무리 (커밋 + 푸시)"
echo "  2️⃣  GCP 프로덕션 배포"
echo "  3️⃣  다른 컴퓨터에서 최신 코드 가져오기"
echo "  4️⃣  로컬 Docker 재시작"
echo "  5️⃣  프로젝트 상태 보기 (PROJECT_STATE.md)"
echo "  6️⃣  전체 워크플로우 (1→2 자동 실행)"
echo "  0️⃣  종료"
echo ""
read -p "선택 (0-6): " choice

case $choice in
    1)
        echo ""
        echo "📝 일일 작업 마무리를 시작합니다..."
        ./scripts/daily-commit.sh
        ;;
    2)
        echo ""
        echo "🚀 GCP 프로덕션 배포를 시작합니다..."
        ./scripts/deploy-to-gcp.sh
        ;;
    3)
        echo ""
        echo "🔄 최신 코드 동기화를 시작합니다..."
        ./scripts/sync-from-github.sh
        ;;
    4)
        echo ""
        echo "🐳 로컬 Docker를 재시작합니다..."
        cd "$(dirname "$0")/.."
        docker-compose down
        docker-compose up -d
        sleep 3
        docker ps
        echo ""
        echo "✅ Docker 재시작 완료!"
        ;;
    5)
        echo ""
        cd "$(dirname "$0")/.."
        if [ -f "PROJECT_STATE.md" ]; then
            cat PROJECT_STATE.md
        else
            echo "⚠️  PROJECT_STATE.md 파일이 없습니다."
        fi
        ;;
    6)
        echo ""
        echo "🎯 전체 워크플로우를 시작합니다..."
        echo "   Step 1: 일일 작업 마무리"
        echo "   Step 2: GCP 배포"
        echo ""
        read -p "계속하시겠습니까? (y/n): " confirm
        if [ "$confirm" = "y" ]; then
            ./scripts/daily-commit.sh
            echo ""
            echo "⏸️  잠시 대기..."
            sleep 2
            ./scripts/deploy-to-gcp.sh
        else
            echo "❌ 취소되었습니다."
        fi
        ;;
    0)
        echo ""
        echo "👋 종료합니다."
        exit 0
        ;;
    *)
        echo ""
        echo "❌ 잘못된 선택입니다."
        exit 1
        ;;
esac

echo ""
echo "✅ 작업 완료!"
echo ""
