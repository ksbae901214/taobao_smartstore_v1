FROM python:3.11-slim

WORKDIR /app

ARG DEBIAN_FRONTEND=noninteractive

# 기본 시스템 의존성만 설치 (Playwright 제외)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 소스 복사
COPY . .
RUN chmod -R 755 /app

CMD ["python", "-u"]
