// =====================================================
// 타오바오 상품 수집기 v3.3
// background.js - 이미지 다운로드 + 환율 조회
// =====================================================

console.log('✅ Background script v3.3 로드됨');

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadImages') {
    downloadMultipleImages(request.urls)
      .then(results => sendResponse({ success: true, data: results }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'getExchangeRate') {
    getExchangeRate()
      .then(rate => sendResponse({ success: true, rate }))
      .catch(error => sendResponse({ success: false, error: error.message, rate: 190 }));
    return true;
  }
});

// 환율 조회 (CNY -> KRW)
async function getExchangeRate() {
  try {
    // 무료 환율 API 사용
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/CNY');
    if (response.ok) {
      const data = await response.json();
      const rate = data.rates.KRW;
      console.log(`💱 환율 조회 성공: 1 CNY = ${rate} KRW`);
      return Math.round(rate);
    }
  } catch (e) {
    console.log('환율 조회 실패, 기본값 사용');
  }
  return 190; // 기본값
}

// 단일 이미지 다운로드
async function downloadImage(url) {
  try {
    // URL 정리
    if (!url) return null;
    if (url.startsWith('//')) url = 'https:' + url;
    if (!url.startsWith('http')) return null;
    
    // 작은 이미지를 큰 이미지로 변환
    url = url
      .replace(/_\d+x\d+[^.]*\.(jpg|jpeg|png|webp)/gi, '.$1')
      .replace(/\.(jpg|jpeg|png|webp)_\d+x\d+[^.]*/gi, '.$1')
      .replace(/_q\d+/gi, '')
      .replace(/\.jpg_.*/i, '.jpg')
      .replace(/\.png_.*/i, '.png')
      .replace(/\.webp_.*/i, '.webp')
      .split('?')[0];
    
    console.log(`📸 다운로드: ${url.substring(0, 60)}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.taobao.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const blob = await response.blob();
    if (blob.size < 1000) return null; // 너무 작은 이미지 무시
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader 오류'));
      reader.readAsDataURL(blob);
    });
    
  } catch (error) {
    console.log(`❌ 다운로드 실패: ${error.message}`);
    return null;
  }
}

// 여러 이미지 다운로드
async function downloadMultipleImages(urls) {
  console.log(`📦 ${urls.length}개 이미지 다운로드 시작`);
  
  const results = [];
  
  for (let i = 0; i < urls.length; i++) {
    const base64 = await downloadImage(urls[i]);
    if (base64) {
      results.push({ success: true, data: base64, index: i });
    } else {
      results.push({ success: false, index: i });
    }
    
    // 진행상황 로그
    if ((i + 1) % 5 === 0) {
      console.log(`   ${i + 1}/${urls.length} 완료`);
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`📦 완료: ${successCount}/${urls.length}개 성공`);
  
  return results;
}
