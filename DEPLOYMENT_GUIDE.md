# 🚀 GCP 배포 가이드 - Taobao SmartStore

## 📋 목차
1. [GCP VM 인스턴스 생성](#1-gcp-vm-인스턴스-생성)
2. [Cloudflare DNS 설정](#2-cloudflare-dns-설정)
3. [로컬에서 서버로 파일 전송](#3-로컬에서-서버로-파일-전송)
4. [GCP 서버에서 배포 실행](#4-gcp-서버에서-배포-실행)
5. [SSL 인증서 설정](#5-ssl-인증서-설정)
6. [서비스 확인](#6-서비스-확인)
7. [문제 해결](#7-문제-해결)

---

## 1. GCP VM 인스턴스 생성

### 1-1. GCP 콘솔 접속
- https://console.cloud.google.com/
- 프로젝트 선택 또는 새로 만들기

### 1-2. VM 인스턴스 생성
1. **좌측 메뉴** → "Compute Engine" → "VM 인스턴스"
2. **"인스턴스 만들기"** 클릭

### 1-3. VM 설정

```
이름: taobao-smartstore
리전: asia-northeast3 (서울)
영역: asia-northeast3-a

머신 구성:
  ├─ 시리즈: E2
  └─ 머신 유형: e2-micro (무료 티어)
     ├─ vCPU: 0.25-1 vCPU
     └─ 메모리: 1GB

부팅 디스크: "변경" 클릭
  ├─ 운영체제: Ubuntu
  ├─ 버전: Ubuntu 22.04 LTS
  ├─ 디스크 유형: 표준 영구 디스크
  └─ 크기: 30GB

ID 및 API 액세스:
  └─ 기본값 유지

방화벽: ⬇️ 중요!
  ├─ ✅ HTTP 트래픽 허용
  └─ ✅ HTTPS 트래픽 허용
```

3. **"만들기"** 클릭 → 약 1-2분 대기

### 1-4. 외부 IP 확인 및 고정
- VM 인스턴스 목록에서 **외부 IP** 확인 (예: 34.64.123.456)
- IP 주소를 **고정 IP로 변경** (권장):
  1. 좌측 메뉴 → "VPC 네트워크" → "IP 주소"
  2. 임시 → "고정" 변경
  3. 이름: taobao-ip

**🔴 이 IP 주소를 메모하세요!** (다음 단계에서 필요)

---

## 2. Cloudflare DNS 설정

### 2-1. Cloudflare 대시보드 접속
- https://dash.cloudflare.com/
- `store-daehaeng.com` 도메인 선택

### 2-2. DNS 레코드 추가

**DNS → 레코드 추가**

#### A 레코드 1:
```
Type: A
Name: @
IPv4 address: [GCP VM 외부 IP]
Proxy status: 🟠 DNS만 (Proxied 끄기)
TTL: Auto
```

#### A 레코드 2:
```
Type: A
Name: www
IPv4 address: [GCP VM 외부 IP]
Proxy status: 🟠 DNS만 (Proxied 끄기)
TTL: Auto
```

**⚠️ 중요**: Proxy 상태를 **"DNS만"**으로 설정하세요! (SSL 인증서 발급 시 필요)

### 2-3. DNS 전파 확인 (5-10분 소요)
```bash
# 로컬 터미널에서 실행
nslookup store-daehaeng.com
nslookup www.store-daehaeng.com
```

IP 주소가 GCP VM IP와 일치하면 완료!

---

## 3. 로컬에서 서버로 파일 전송

### 3-1. GCP SSH 키 설정 (처음 한 번만)

**방법 1: GCP 콘솔에서 SSH 키 등록**
1. 로컬 터미널에서 SSH 키 생성 (이미 있으면 스킵):
```bash
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
# Enter 3번 (기본 경로, 비밀번호 없음)
```

2. 공개키 복사:
```bash
cat ~/.ssh/id_rsa.pub
```

3. GCP 콘솔:
   - "Compute Engine" → "메타데이터" → "SSH 키"
   - "수정" → "항목 추가"
   - 복사한 공개키 붙여넣기 → "저장"

**방법 2: GCP 콘솔에서 브라우저 SSH 사용**
- VM 인스턴스 목록에서 "SSH" 버튼 클릭 → 브라우저에서 바로 접속

### 3-2. 파일 전송

**옵션 A: SCP로 전송 (권장)**
```bash
# 로컬 터미널에서 실행
cd /Users/macbook14/Desktop

# USERNAME은 GCP 계정의 사용자 이름 (보통 이메일 앞부분)
# GCP_IP는 VM 외부 IP 주소
scp -r taobao_smartstore_v1 USERNAME@GCP_IP:~/taobao_smartstore
```

예시:
```bash
scp -r taobao_smartstore_v1 john@34.64.123.456:~/taobao_smartstore
```

**옵션 B: Git 사용**
1. GitHub에 프로젝트 업로드
2. GCP VM에서 clone
```bash
git clone YOUR_REPO_URL ~/taobao_smartstore
```

---

## 4. GCP 서버에서 배포 실행

### 4-1. SSH로 GCP 서버 접속
```bash
ssh USERNAME@GCP_IP
```

또는 GCP 콘솔에서 "SSH" 버튼 클릭

### 4-2. 배포 스크립트 실행
```bash
cd ~/taobao_smartstore

# 스크립트 실행 권한 부여
chmod +x deploy-to-gcp.sh
chmod +x setup-ssl.sh

# 배포 스크립트 실행
./deploy-to-gcp.sh
```

**스크립트가 하는 일:**
- ✅ 시스템 패키지 업데이트
- ✅ Docker & Docker Compose 설치
- ✅ Git 설치
- ✅ 프로젝트 디렉토리 생성
- ✅ 방화벽 설정 (포트 80, 443, 22)

### 4-3. Docker Compose로 서비스 시작
```bash
cd ~/taobao_smartstore
docker-compose up -d --build
```

**빌드 시간**: 약 3-5분 소요 (처음에만)

### 4-4. 서비스 상태 확인
```bash
docker ps
```

다음과 같이 3개 컨테이너가 실행 중이어야 합니다:
```
CONTAINER ID   IMAGE              STATUS         PORTS
xxxxx         taobao_nginx       Up 10 seconds  0.0.0.0:80->80/tcp
xxxxx         taobao_backend     Up 15 seconds  0.0.0.0:3000->3000/tcp
xxxxx         redis:7-alpine     Up 20 seconds  0.0.0.0:6379->6379/tcp
```

---

## 5. SSL 인증서 설정

### 5-1. setup-ssl.sh 파일 수정
```bash
nano setup-ssl.sh
```

**EMAIL 변수를 본인 이메일로 수정:**
```bash
EMAIL="your-email@example.com"  # ← 여기 수정!
```

`Ctrl + X` → `Y` → `Enter` (저장)

### 5-2. SSL 스크립트 실행
```bash
./setup-ssl.sh
```

**스크립트가 하는 일:**
- ✅ Certbot 설치
- ✅ Let's Encrypt SSL 인증서 발급
- ✅ Nginx HTTPS 설정 자동 업데이트
- ✅ HTTP → HTTPS 자동 리디렉션

**소요 시간**: 약 1-2분

---

## 6. 서비스 확인

### 6-1. 웹사이트 접속
브라우저에서 다음 URL 접속:
- ✅ https://store-daehaeng.com
- ✅ https://www.store-daehaeng.com

### 6-2. API 테스트
```bash
curl https://store-daehaeng.com/api/test
```

응답:
```json
{
  "status": "ok",
  "message": "Taobao SmartStore API is running",
  "version": "5.8",
  "timestamp": "..."
}
```

### 6-3. 로그 확인
```bash
# 모든 컨테이너 로그
docker-compose logs

# 특정 컨테이너만
docker logs taobao_backend
docker logs taobao_nginx
docker logs taobao_redis
```

---

## 7. 문제 해결

### 🔴 문제 1: "Connection refused" 또는 사이트 접속 안 됨

**원인 1: DNS 전파 대기 중**
```bash
# DNS 확인
nslookup store-daehaeng.com
```
→ 5-10분 대기 후 재시도

**원인 2: 방화벽 미설정**
```bash
# GCP 방화벽 규칙 확인
gcloud compute firewall-rules list
```

GCP 콘솔에서 수동 확인:
1. "VPC 네트워크" → "방화벽"
2. HTTP(80), HTTPS(443) 규칙이 있는지 확인

**원인 3: Docker 컨테이너 중지**
```bash
docker ps -a
```
→ 모든 컨테이너가 "Up" 상태여야 함

재시작:
```bash
docker-compose down
docker-compose up -d --build
```

---

### 🔴 문제 2: SSL 인증서 발급 실패

**원인**: Cloudflare Proxy가 켜져 있음

**해결**:
1. Cloudflare 대시보드
2. DNS → A 레코드
3. 🟠 "DNS만" (Proxied 끄기)
4. 10분 대기 후 재시도:
```bash
./setup-ssl.sh
```

---

### 🔴 문제 3: 메모리 부족 (e2-micro는 1GB RAM)

**증상**:
```bash
docker logs taobao_backend
# Error: JavaScript heap out of memory
```

**해결 방법 1**: Swap 메모리 추가
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 영구 설정
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**해결 방법 2**: VM 업그레이드
- e2-small (2GB RAM, 유료: $13/월)

---

### 🔴 문제 4: Docker 명령어 권한 에러

```bash
# Docker 그룹에 사용자 추가
sudo usermod -aG docker $USER

# 로그아웃 후 재로그인
exit
ssh USERNAME@GCP_IP
```

---

## 8. 유지보수 명령어

### 서비스 재시작
```bash
cd ~/taobao_smartstore
docker-compose restart
```

### 로그 실시간 확인
```bash
docker-compose logs -f
```

### 컨테이너 중지
```bash
docker-compose down
```

### 디스크 공간 확인
```bash
df -h
```

### SSL 인증서 갱신 (90일마다)
```bash
sudo certbot renew
docker-compose restart nginx
```

### 자동 갱신 Cron 설정
```bash
sudo crontab -e
```
다음 줄 추가:
```
0 0 1 * * certbot renew --quiet --deploy-hook 'cd /home/USERNAME/taobao_smartstore && docker-compose restart nginx'
```

---

## 9. 보안 체크리스트

- [ ] SSH 비밀번호 로그인 비활성화 (키만 사용)
- [ ] GCP 방화벽에서 불필요한 포트 차단
- [ ] `.env` 파일에 민감 정보 분리
- [ ] 정기적인 시스템 업데이트 (월 1회)
- [ ] Docker 이미지 업데이트 (월 1회)
- [ ] 백업 설정 (GCP 스냅샷)

---

## 10. 다음 단계

배포가 완료되었습니다! 이제:

1. **Chrome Extension 설정**
   - Extension에서 API URL을 `https://store-daehaeng.com/api`로 변경

2. **네이버 스마트스토어 API 설정**
   - 네이버 개발자 센터에서 Redirect URI 등록
   - `https://store-daehaeng.com/callback`

3. **Google Cloud Translation API 활성화**
   - GCP 콘솔에서 API 활성화
   - 서비스 계정 키 생성 및 환경변수 설정

4. **데이터베이스 백업**
   - Redis 데이터 정기 백업
   - 스토리지 이미지 백업

---

## 📞 지원

문제가 계속되면:
1. 로그 확인: `docker-compose logs`
2. 시스템 상태: `docker ps -a`
3. 디스크 공간: `df -h`
4. 메모리 상태: `free -h`

**축하합니다! 🎉 배포 완료!**
