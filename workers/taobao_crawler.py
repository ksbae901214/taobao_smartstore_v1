import os
import json
import time
import asyncio
import re
from playwright.async_api import async_playwright
from database import get_db_connection
import redis
from loguru import logger

# Redis 연결
redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'redis'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    decode_responses=True
)

logger.info("🤖 타오바오 크롤러 워커 시작...")

async def crawl_taobao_product(url):
    """
    타오바오 상품 페이지 크롤링
    """
    logger.info(f"🔍 크롤링 시작: {url}")
    
    result = {
        'url': url,
        'success': False,
        'product_id': None,
        'title_cn': None,
        'price_cny': None,
        'thumbnails': [],
        'detail_images': [],
        'options': [],
        'stock': 0,
        'description_cn': None
    }
    
    try:
        # 상품 ID 추출
        product_id_match = re.search(r'id=(\d+)', url)
        if product_id_match:
            result['product_id'] = product_id_match.group(1)
        
        async with async_playwright() as p:
            # 브라우저 시작
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled'
                ]
            )
            
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            )
            
            page = await context.new_page()
            
            # 타오바오 페이지 접속
            logger.info(f"📄 페이지 접속 중...")
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await page.wait_for_timeout(3000)  # 페이지 로딩 대기
            
            # 상품명 추출
            try:
                title_selectors = [
                    'h1[class*="title"]',
                    'div[class*="tb-detail-hd"] h1',
                    'div[class*="ItemTitle"] h1',
                    'h3[class*="title"]',
                    '.tb-main-title'
                ]
                
                for selector in title_selectors:
                    title_element = await page.query_selector(selector)
                    if title_element:
                        result['title_cn'] = await title_element.inner_text()
                        result['title_cn'] = result['title_cn'].strip()
                        logger.info(f"✅ 상품명: {result['title_cn'][:50]}...")
                        break
            except Exception as e:
                logger.error(f"상품명 추출 실패: {e}")
            
            # 가격 추출
            try:
                price_selectors = [
                    'span[class*="priceText"]',
                    'em[class*="tb-rmb-num"]',
                    'span[class*="price"]',
                    '.tb-price',
                    'strong[class*="price"]'
                ]
                
                for selector in price_selectors:
                    price_element = await page.query_selector(selector)
                    if price_element:
                        price_text = await price_element.inner_text()
                        # 숫자만 추출
                        price_match = re.search(r'[\d.]+', price_text)
                        if price_match:
                            result['price_cny'] = float(price_match.group())
                            logger.info(f"✅ 가격: ¥{result['price_cny']}")
                            break
            except Exception as e:
                logger.error(f"가격 추출 실패: {e}")
            
            # 썸네일 이미지 추출
            try:
                thumbnail_selectors = [
                    'ul[class*="tb-thumb"] img',
                    'div[class*="gallery"] img',
                    'ul[id*="J_UlThumb"] img'
                ]
                
                for selector in thumbnail_selectors:
                    thumbnails = await page.query_selector_all(selector)
                    if thumbnails:
                        for thumb in thumbnails[:5]:  # 최대 5개
                            img_url = await thumb.get_attribute('src')
                            if not img_url:
                                img_url = await thumb.get_attribute('data-src')
                            if img_url:
                                # HTTP로 시작하지 않으면 추가
                                if img_url.startswith('//'):
                                    img_url = 'https:' + img_url
                                result['thumbnails'].append(img_url)
                        logger.info(f"✅ 썸네일: {len(result['thumbnails'])}개")
                        break
            except Exception as e:
                logger.error(f"썸네일 추출 실패: {e}")
            
            # 상세 이미지 추출
            try:
                detail_selectors = [
                    'div[class*="detail"] img',
                    'div[id*="description"] img',
                    'div[class*="desc"] img'
                ]
                
                for selector in detail_selectors:
                    detail_imgs = await page.query_selector_all(selector)
                    if detail_imgs:
                        for img in detail_imgs[:10]:  # 최대 10개
                            img_url = await img.get_attribute('src')
                            if not img_url:
                                img_url = await img.get_attribute('data-src')
                            if img_url and img_url not in result['detail_images']:
                                if img_url.startswith('//'):
                                    img_url = 'https:' + img_url
                                result['detail_images'].append(img_url)
                        logger.info(f"✅ 상세이미지: {len(result['detail_images'])}개")
                        break
            except Exception as e:
                logger.error(f"상세이미지 추출 실패: {e}")
            
            # 재고 추출 (추정)
            try:
                result['stock'] = 999  # 기본값
            except Exception as e:
                logger.error(f"재고 추출 실패: {e}")
            
            await browser.close()
            result['success'] = True
            logger.info(f"✅ 크롤링 완료!")
            
    except Exception as e:
        logger.error(f"❌ 크롤링 실패: {e}")
        result['error'] = str(e)
    
    return result

async def process_crawl_queue():
    """
    Redis 큐에서 크롤링 작업 처리
    """
    logger.info("⏳ 크롤링 큐 모니터링 시작...")
    
    while True:
        try:
            # Redis에서 작업 가져오기
            job_data = redis_client.brpop('crawl_queue', timeout=5)
            
            if job_data:
                queue_name, job_json = job_data
                job = json.loads(job_json)
                
                url = job.get('url')
                product_id = job.get('product_id')
                
                logger.info(f"📦 새 작업: {product_id}")
                
                # 크롤링 실행
                result = await crawl_taobao_product(url)
                
                # 결과를 Redis에 저장 (결과 큐)
                result_key = f"crawl_result:{product_id}"
                redis_client.setex(
                    result_key,
                    3600,  # 1시간 후 만료
                    json.dumps(result, ensure_ascii=False)
                )
                
                logger.info(f"✅ 결과 저장: {result_key}")
                
                # 데이터베이스에 저장 (선택사항)
                try:
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    
                    cursor.execute("""
                        INSERT INTO products (
                            taobao_product_id, taobao_url, status, 
                            title_cn, price_cny, stock_quantity, crawled_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (taobao_product_id) 
                        DO UPDATE SET 
                            title_cn = EXCLUDED.title_cn,
                            price_cny = EXCLUDED.price_cny,
                            stock_quantity = EXCLUDED.stock_quantity,
                            crawled_at = NOW()
                        RETURNING id
                    """, (
                        product_id,
                        url,
                        'scraped',
                        result.get('title_cn'),
                        result.get('price_cny'),
                        result.get('stock', 0)
                    ))
                    
                    product_db_id = cursor.fetchone()['id']
                    
                    # 이미지 저장
                    for idx, img_url in enumerate(result.get('thumbnails', [])):
                        cursor.execute("""
                            INSERT INTO product_images (
                                product_id, image_type, original_url, sort_order
                            ) VALUES (%s, %s, %s, %s)
                            ON CONFLICT DO NOTHING
                        """, (product_db_id, 'thumbnail', img_url, idx))
                    
                    for idx, img_url in enumerate(result.get('detail_images', [])):
                        cursor.execute("""
                            INSERT INTO product_images (
                                product_id, image_type, original_url, sort_order
                            ) VALUES (%s, %s, %s, %s)
                            ON CONFLICT DO NOTHING
                        """, (product_db_id, 'detail', img_url, idx))
                    
                    conn.commit()
                    cursor.close()
                    conn.close()
                    
                    logger.info(f"✅ DB 저장 완료: product_id={product_db_id}")
                    
                except Exception as e:
                    logger.error(f"❌ DB 저장 실패: {e}")
                
        except Exception as e:
            logger.error(f"❌ 큐 처리 오류: {e}")
            await asyncio.sleep(5)

if __name__ == '__main__':
    # 데이터베이스 연결 테스트
    from database import test_connection
    test_connection()
    
    # 크롤링 큐 처리 시작
    asyncio.run(process_crawl_queue())
