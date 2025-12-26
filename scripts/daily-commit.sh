#!/bin/bash

# 🎯 타오바오 스마트스토어 - 일일 작업 마무리 스크립트
# 실행: ./scripts/daily-commit.sh

set -e  # 에러 발생시 중단

echo "🚀 일일 작업 마무리를 시작합니다..."
echo ""

# 프로젝트 루트로 이동
cd "$(dirname "$0")/.."

# 1. 현재 상태 확인
echo "📊 1단계: 현재 Git 상태 확인"
git status

echo ""
read -p "❓ Git에 커밋할 파일이 있습니까? (y/n): " confirm
if [ "$confirm" != "y" ]; then
    echo "❌ 작업을 취소합니다."
    exit 0
fi

# 2. 변경사항 확인
echo ""
echo "📝 2단계: 변경된 파일 목록"
git diff --name-only
echo ""

# 3. 커밋 메시지 입력
echo "✍️  3단계: 커밋 메시지 입력"
read -p "커밋 메시지를 입력하세요: " commit_message

if [ -z "$commit_message" ]; then
    commit_message="일일 작업 마무리 ($(date +%Y-%m-%d))"
fi

# 4. PROJECT_STATE.md 업데이트
echo ""
echo "📄 4단계: PROJECT_STATE.md 자동 업데이트"

# 현재 날짜
current_date=$(date +%Y-%m-%d)
current_time=$(date +"%Y-%m-%d %H:%M KST")

# PROJECT_STATE.md에 마지막 업데이트 날짜 변경
if [ -f "PROJECT_STATE.md" ]; then
    # macOS와 Linux 호환
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/\*\*최종 업데이트\*\*:.*/\*\*최종 업데이트\*\*: $current_date/" PROJECT_STATE.md
        sed -i '' "s/\*\*마지막 업데이트\*\*:.*/\*\*마지막 업데이트\*\*: $current_time/" PROJECT_STATE.md
    else
        sed -i "s/\*\*최종 업데이트\*\*:.*/\*\*최종 업데이트\*\*: $current_date/" PROJECT_STATE.md
        sed -i "s/\*\*마지막 업데이트\*\*:.*/\*\*마지막 업데이트\*\*: $current_time/" PROJECT_STATE.md
    fi

    # 작업 내용 추가 (수동 입력)
    echo ""
    echo "📋 오늘 작업한 내용을 간단히 입력하세요 (엔터 두 번으로 종료):"
    echo "예시: - 옵션 이미지 표시 기능 추가"

    work_log=""
    while IFS= read -r line; do
        if [ -z "$line" ]; then
            if [ -z "$work_log" ]; then
                continue
            else
                break
            fi
        fi
        work_log="$work_log$line"$'\n'
    done

    # 작업 로그를 임시 파일에 저장
    if [ -n "$work_log" ]; then
        temp_file=$(mktemp)
        echo "### $current_date" > "$temp_file"
        echo "$work_log" >> "$temp_file"
        echo "" >> "$temp_file"

        # PROJECT_STATE.md의 "최근 완료된 작업" 섹션 뒤에 추가
        awk -v date="$current_date" -v log="$(cat $temp_file)" '
            /## ✅ 최근 완료된 작업/ {
                print
                getline
                print
                print log
                next
            }
            {print}
        ' PROJECT_STATE.md > PROJECT_STATE.tmp
        mv PROJECT_STATE.tmp PROJECT_STATE.md

        rm "$temp_file"
        echo "✅ PROJECT_STATE.md 업데이트 완료"
    fi
else
    echo "⚠️  PROJECT_STATE.md 파일이 없습니다. 건너뜁니다."
fi

# 5. Git add
echo ""
echo "📦 5단계: 변경사항 스테이징"
git add .

# 6. Git commit
echo ""
echo "💾 6단계: Git 커밋"
git commit -m "$commit_message"

# 7. Git push
echo ""
echo "🚀 7단계: GitHub에 푸시"
read -p "GitHub에 푸시하시겠습니까? (y/n): " push_confirm

if [ "$push_confirm" = "y" ]; then
    git push origin main
    echo "✅ GitHub에 푸시 완료!"
else
    echo "⏸️  푸시를 건너뜁니다. 나중에 'git push origin main'으로 푸시하세요."
fi

# 8. 요약
echo ""
echo "========================================="
echo "✅ 일일 작업 마무리 완료!"
echo "========================================="
echo "📝 커밋 메시지: $commit_message"
echo "📅 업데이트 날짜: $current_date"
echo ""
echo "💡 다음 단계:"
echo "1. 다른 컴퓨터에서: git pull origin main"
echo "2. Claude Code에 붙여넣기: 'PROJECT_STATE.md 읽어줘'"
echo ""
