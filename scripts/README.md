# 🚀 개발 워크플로우 자동화 스크립트

## 📋 스크립트 목록

### 🎯 `dev-workflow.sh` - 통합 메뉴 (추천)

모든 작업을 메뉴에서 선택 가능한 통합 스크립트

```bash
./scripts/dev-workflow.sh
```

**메뉴 옵션:**
1. 일일 작업 마무리 (커밋 + 푸시)
2. GCP 프로덕션 배포
3. 다른 컴퓨터에서 최신 코드 가져오기
4. 로컬 Docker 재시작
5. 프로젝트 상태 보기
6. 전체 워크플로우 (1→2 자동 실행)

---

### 📝 `daily-commit.sh` - 일일 작업 마무리

매일 개발 종료 시 실행하는 스크립트

```bash
./scripts/daily-commit.sh
```

**수행 작업:**
1. Git 상태 확인
2. 변경된 파일 목록 표시
3. 커밋 메시지 입력 받기
4. PROJECT_STATE.md 자동 업데이트
   - 최종 업데이트 날짜 갱신
   - 오늘 작업 내용 추가
5. Git add, commit, push

**사용 예시:**
```bash
cd /Users/kyusik/taobao-smartstore
./scripts/daily-commit.sh

# 프롬프트 응답:
# 1. Git 커밋 확인: y
# 2. 커밋 메시지: "옵션 이미지 표시 기능 추가"
# 3. 작업 내용 입력:
#    - 옵션 이미지 60x60 썸네일 추가
#    - WebP 자동 변환 기능 구현
#    (엔터 두 번)
# 4. GitHub 푸시: y
```

---

### 🚀 `deploy-to-gcp.sh` - GCP 프로덕션 배포

로컬 테스트 완료 후 GCP 서버에 배포

```bash
./scripts/deploy-to-gcp.sh
```

**수행 작업:**
1. 로컬 테스트 완료 여부 확인
2. Git 상태 확인 (브랜치, 커밋 여부)
3. GitHub 푸시 상태 확인
4. GCP 서버 SSH 접속
5. 최신 코드 pull
6. Docker 재빌드 및 재시작
7. 배포 확인 (curl 테스트)

**주의사항:**
- 반드시 로컬에서 충분히 테스트 후 실행
- main 브랜치에서 실행 권장
- 커밋되지 않은 변경사항 없어야 함

---

### 🔄 `sync-from-github.sh` - 다른 컴퓨터에서 최신 코드 가져오기

컴퓨터 A에서 작업 후, 컴퓨터 B에서 실행

```bash
./scripts/sync-from-github.sh
```

**수행 작업:**
1. 로컬 변경사항 확인 (있으면 stash)
2. GitHub에서 최신 코드 pull
3. PROJECT_STATE.md 확인 및 표시
4. Docker 재시작 여부 확인
5. Claude Code 사용 안내

**사용 시나리오:**
```bash
# 컴퓨터 A에서:
./scripts/daily-commit.sh

# 컴퓨터 B에서:
./scripts/sync-from-github.sh
# → Claude Code에 "PROJECT_STATE.md 읽어줘" 요청
```

---

## 🎯 전체 워크플로우

### 📍 시나리오 1: 일일 개발 마무리 (컴퓨터 A)

```bash
cd /Users/kyusik/taobao-smartstore

# 방법 1: 통합 메뉴 사용
./scripts/dev-workflow.sh
# → 메뉴에서 "1" 선택

# 방법 2: 직접 실행
./scripts/daily-commit.sh
```

### 📍 시나리오 2: GCP 프로덕션 배포 (테스트 완료 후)

```bash
# 방법 1: 통합 메뉴 사용
./scripts/dev-workflow.sh
# → 메뉴에서 "2" 선택

# 방법 2: 직접 실행
./scripts/deploy-to-gcp.sh
```

### 📍 시나리오 3: 다른 컴퓨터에서 작업 시작 (컴퓨터 B)

```bash
cd ~/taobao-smartstore  # 프로젝트 경로

# 방법 1: 통합 메뉴 사용
./scripts/dev-workflow.sh
# → 메뉴에서 "3" 선택

# 방법 2: 직접 실행
./scripts/sync-from-github.sh

# 방법 3: Claude Code에서
# "PROJECT_STATE.md 파일을 읽고 최근 작업 내용을 요약해줘"
```

### 📍 시나리오 4: 전체 자동화 (커밋 → 배포)

```bash
./scripts/dev-workflow.sh
# → 메뉴에서 "6" 선택

# 또는
./scripts/daily-commit.sh && ./scripts/deploy-to-gcp.sh
```

---

## ⚙️ 초기 설정

### 1. 스크립트 실행 권한 부여

```bash
chmod +x scripts/*.sh
```

### 2. Git 저장소 설정 확인

```bash
git remote -v
# origin  https://github.com/ksbae901214/taobao_smartstore_v1.git (fetch)
# origin  https://github.com/ksbae901214/taobao_smartstore_v1.git (push)
```

### 3. GCP SSH 접속 설정 확인

```bash
# SSH 키가 등록되어 있어야 함
ssh ksbae901214@34.64.37.97
```

없다면:
```bash
ssh-keygen -t rsa -b 4096
ssh-copy-id ksbae901214@34.64.37.97
```

---

## 🔧 문제 해결

### Q1: 스크립트 실행 시 "Permission denied" 에러

```bash
chmod +x scripts/*.sh
```

### Q2: GCP 배포 시 SSH 연결 실패

```bash
# SSH 키 확인
ssh -v ksbae901214@34.64.37.97

# 또는 GCP 콘솔에서 직접 접속
gcloud compute ssh instance-1 --zone=asia-northeast3-a
```

### Q3: PROJECT_STATE.md 업데이트 안됨

스크립트에서 sed 명령어 실행 권한 확인:
```bash
ls -la PROJECT_STATE.md
chmod 644 PROJECT_STATE.md
```

### Q4: Git push 시 인증 필요

```bash
# Personal Access Token 설정
git config --global credential.helper store
git push origin main
# → GitHub 사용자명/토큰 입력
```

---

## 📝 팁

### 별칭(Alias) 설정 (선택사항)

`~/.zshrc` 또는 `~/.bashrc`에 추가:

```bash
# 타오바오 스마트스토어 별칭
alias tbs-menu='cd /Users/kyusik/taobao-smartstore && ./scripts/dev-workflow.sh'
alias tbs-commit='cd /Users/kyusik/taobao-smartstore && ./scripts/daily-commit.sh'
alias tbs-deploy='cd /Users/kyusik/taobao-smartstore && ./scripts/deploy-to-gcp.sh'
alias tbs-sync='cd /Users/kyusik/taobao-smartstore && ./scripts/sync-from-github.sh'
```

적용:
```bash
source ~/.zshrc  # 또는 source ~/.bashrc
```

사용:
```bash
tbs-menu      # 어디서든 메뉴 실행
tbs-commit    # 어디서든 커밋
tbs-deploy    # 어디서든 배포
tbs-sync      # 어디서든 동기화
```

---

## 📚 관련 문서

- [PROJECT_STATE.md](../PROJECT_STATE.md) - 프로젝트 현재 상태
- [docker-compose.yml](../docker-compose.yml) - Docker 설정
- [.env.example](../.env.example) - 환경변수 예시

---

**마지막 업데이트**: 2024-12-24
