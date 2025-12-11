import os
import psycopg2
from psycopg2.extras import RealDictCursor

def get_db_connection():
    """PostgreSQL 연결 생성"""
    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', '5432'),
        user=os.getenv('DB_USER', 'taobao'),
        password=os.getenv('DB_PASSWORD', 'taobao123'),
        database=os.getenv('DB_NAME', 'taobao_smartstore'),
        cursor_factory=RealDictCursor
    )

def test_connection():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        conn.close()
        print("✅ 데이터베이스 연결 성공!")
        return True
    except Exception as e:
        print(f"❌ 데이터베이스 연결 실패: {e}")
        return False

if __name__ == '__main__':
    test_connection()
