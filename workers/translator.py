import time
from database import test_connection

print("🌐 번역 워커 시작...")
test_connection()

while True:
    print("⏳ 번역 작업 대기 중...")
    time.sleep(60)
