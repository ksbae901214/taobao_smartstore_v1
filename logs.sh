#!/bin/bash

# ===========================================
# 서버 로그 보기
# ===========================================

echo ""
echo "🔍 서버 로그 보기 (종료: Ctrl+C)"
echo "=================================="
echo ""

cd "$(dirname "${BASH_SOURCE[0]}")"

docker-compose logs -f --tail=100 2>/dev/null || docker compose logs -f --tail=100 2>/dev/null
