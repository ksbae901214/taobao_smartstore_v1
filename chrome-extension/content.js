// content-script-store-monitor.js
// 타오바오 스토어 페이지에서 상품 목록을 수집하는 스크립트

(function() {
    'use strict';
    
    console.log('🔍 타오바오 스토어 모니터링 스크립트 로드됨');
    
    const SERVER_URL = 'http://localhost:3000';
    
    // 현재 페이지가 스토어 페이지인지 확인
    function isStorePage() {
        const url = window.location.href;
        return url.includes('shop') && url.includes('.taobao.com');
    }
    
    // 스토어 ID 추출
    function getStoreId() {
        const url = window.location.href;
        const match = url.match(/shop(\d+)/);
        return match ? match[1] : null;
    }
    
    // 스토어 상품 목록 수집
    function collectStoreProducts() {
        console.log('📦 스토어 상품 수집 시작...');
        
        const products = [];
        
        // 타오바오 스토어 페이지의 상품 카드 선택자
        // (실제 선택자는 페이지 구조에 따라 조정 필요)
        const productCards = document.querySelectorAll('.item, .product-item, .shop-list-item');
        
        console.log(`   발견된 상품 카드: ${productCards.length}개`);
        
        productCards.forEach((card, index) => {
            try {
                // 상품 링크
                const linkEl = card.querySelector('a[href*="item.htm"]');
                const productUrl = linkEl ? linkEl.href : null;
                
                if (!productUrl) return;
                
                // 상품 ID 추출
                const idMatch = productUrl.match(/[?&]id=(\d+)/);
                const productId = idMatch ? idMatch[1] : null;
                
                if (!productId) return;
                
                // 상품명
                const titleEl = card.querySelector('.title, .item-title, .product-title');
                const title = titleEl ? titleEl.textContent.trim() : '';
                
                // 가격
                const priceEl = card.querySelector('.price, .item-price, .product-price');
                let price = 0;
                if (priceEl) {
                    const priceText = priceEl.textContent.replace(/[^0-9.]/g, '');
                    price = parseFloat(priceText) || 0;
                }
                
                // 이미지
                const imgEl = card.querySelector('img');
                let image = '';
                if (imgEl) {
                    image = imgEl.src || imgEl.dataset.src || '';
                    // https로 변경
                    if (image.startsWith('//')) {
                        image = 'https:' + image;
                    }
                }
                
                products.push({
                    product_id: productId,
                    title: title,
                    price: price,
                    url: productUrl,
                    image: image,
                    collected_at: new Date().toISOString()
                });
                
            } catch (err) {
                console.error(`상품 ${index + 1} 처리 오류:`, err);
            }
        });
        
        console.log(`✅ 수집 완료: ${products.length}개 상품`);
        return products;
    }
    
    // 서버에 상품 목록 전송
    async function sendProductsToServer(storeId, products) {
        try {
            const monitorId = `store_${storeId}`;
            
            console.log(`📤 서버로 전송 중... (모니터 ID: ${monitorId})`);
            
            const response = await fetch(`${SERVER_URL}/api/monitors/${monitorId}/products`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ products })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                console.log('✅ 서버 전송 성공');
                console.log(`   전체 상품: ${data.total_products}개`);
                console.log(`   신제품: ${data.new_products}개`);
                
                if (data.new_products > 0) {
                    alert(`🆕 신제품 ${data.new_products}개가 발견되었습니다!`);
                }
                
                return data;
            } else {
                console.error('❌ 서버 전송 실패:', data.error);
                return null;
            }
            
        } catch (err) {
            console.error('❌ 서버 전송 오류:', err);
            return null;
        }
    }
    
    // 자동 수집 버튼 추가
    function addCollectionButton() {
        // 이미 버튼이 있으면 중복 추가 방지
        if (document.getElementById('taobao-monitor-btn')) {
            return;
        }
        
        const button = document.createElement('button');
        button.id = 'taobao-monitor-btn';
        button.innerHTML = '🔍 상품 목록 수집';
        button.style.cssText = `
            position: fixed;
            top: 120px;
            right: 20px;
            z-index: 999999;
            padding: 15px 25px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.3s;
        `;
        
        button.onmouseover = () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.4)';
        };
        
        button.onmouseout = () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        };
        
        button.onclick = async () => {
            button.disabled = true;
            button.innerHTML = '⏳ 수집 중...';
            
            const storeId = getStoreId();
            if (!storeId) {
                alert('스토어 ID를 찾을 수 없습니다');
                button.disabled = false;
                button.innerHTML = '🔍 상품 목록 수집';
                return;
            }
            
            // 스크롤하여 모든 상품 로드 (lazy loading 대응)
            await scrollToLoadAll();
            
            // 상품 수집
            const products = collectStoreProducts();
            
            if (products.length === 0) {
                alert('수집된 상품이 없습니다. 페이지를 확인해주세요.');
                button.disabled = false;
                button.innerHTML = '🔍 상품 목록 수집';
                return;
            }
            
            // 서버로 전송
            const result = await sendProductsToServer(storeId, products);
            
            button.disabled = false;
            button.innerHTML = '🔍 상품 목록 수집';
            
            if (result) {
                if (result.new_products > 0) {
                    button.innerHTML = `✅ 완료 (신제품 ${result.new_products}개)`;
                } else {
                    button.innerHTML = '✅ 완료 (신제품 없음)';
                }
                
                setTimeout(() => {
                    button.innerHTML = '🔍 상품 목록 수집';
                }, 3000);
            }
        };
        
        document.body.appendChild(button);
        console.log('✅ 수집 버튼 추가됨');
    }
    
    // 스크롤하여 모든 상품 로드
    async function scrollToLoadAll() {
        console.log('📜 페이지 스크롤 중...');
        
        const scrollStep = 500;
        const scrollDelay = 300;
        
        let lastHeight = document.body.scrollHeight;
        let scrollCount = 0;
        const maxScrolls = 20; // 최대 20번 스크롤
        
        while (scrollCount < maxScrolls) {
            window.scrollBy(0, scrollStep);
            await new Promise(resolve => setTimeout(resolve, scrollDelay));
            
            const newHeight = document.body.scrollHeight;
            if (newHeight === lastHeight) {
                // 더 이상 로드할 내용이 없음
                break;
            }
            
            lastHeight = newHeight;
            scrollCount++;
        }
        
        // 맨 위로 스크롤
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log(`✅ 스크롤 완료 (${scrollCount}회)`);
    }
    
    // 초기화
    function init() {
        if (!isStorePage()) {
            console.log('ℹ️ 스토어 페이지가 아닙니다');
            return;
        }
        
        const storeId = getStoreId();
        console.log(`📍 스토어 ID: ${storeId}`);
        
        // 페이지 로드 후 버튼 추가
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(addCollectionButton, 2000);
            });
        } else {
            setTimeout(addCollectionButton, 2000);
        }
    }
    
    init();
    
})();
