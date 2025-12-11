import time
from database import test_connection

print("🖼️  이미지 다운로더 워커 시작...")
test_connection()

while True:
    print("⏳ 이미지 처리 대기 중...")
    time.sleep(60)
