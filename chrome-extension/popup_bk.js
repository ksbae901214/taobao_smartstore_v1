// =====================================================
// 타오바오 상품 수집기 v4.1
// popup.js - 썸네일/상세 완전 분리, 순차 처리
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['serverUrl']);
  if (stored.serverUrl) {
    document.getElementById('serverUrl').value = stored.serverUrl;
  }
  
  checkServerConnection();
  
  document.getElementById('serverUrl').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ serverUrl: e.target.value });
    checkServerConnection();
  });
  
  document.getElementById('extractBtn').addEventListener('click', startExtraction);
});

async function checkServerConnection() {
  const serverUrl = document.getElementById('serverUrl').value;
  const badge = document.getElementById('serverStatus');
  
  badge.textContent = '⏳ 연결 확인 중...';
  badge.className = 'status-badge checking';
  
  try {
    const response = await fetch(`${serverUrl}/health`, { method: 'GET' });
    if (response.ok) {
      badge.textContent = '✅ 서버 연결됨';
      badge.className = 'status-badge connected';
    } else {
      throw new Error();
    }
  } catch (error) {
    badge.textContent = '❌ 서버 연결 안됨';
    badge.className = 'status-badge disconnected';
  }
}

function showMessage(text, type = 'success') {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.className = `message show ${type}`;
  setTimeout(() => msg.classList.remove('show'), 4000);
}

function updateProgress(percent, status) {
  document.getElementById('progressFill').style.width = percent + '%';
  document.getElementById('progressStatus').textContent = status;
}

function updateStats(thumbs, details, options) {
  document.getElementById('thumbCount').textContent = thumbs;
  document.getElementById('detailCount').textContent = details;
  document.getElementById('optionCount').textContent = options;
}

// =====================================================
// 메인 수집 함수 - 단계별 순차 처리
// =====================================================

async function startExtraction() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('taobao.com') && !tab.url.includes('tmall.com')) {
    showMessage('타오바오/티몰 상품 페이지에서 사용하세요', 'error');
    return;
  }
  
  const serverUrl = document.getElementById('serverUrl').value;
  const btn = document.getElementById('extractBtn');
  
  btn.disabled = true;
  btn.textContent = '⏳ 수집 중...';
  document.getElementById('progressContainer').classList.add('show');
  document.getElementById('resultCard').classList.remove('show');
  
  try {
    // ========== STEP 1: 기본 정보 추출 ==========
    updateProgress(5, '1/7 상품 정보 추출 중...');
    
    const infoResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractBasicProductInfo
    });
    
    if (!infoResult?.[0]?.result) {
      throw new Error('상품 정보 추출 실패');
    }
    
    const productInfo = infoResult[0].result;
    console.log('=== 상품 정보 ===');
    console.log('제목:', productInfo.title);
    console.log('가격:', productInfo.price);
    console.log('상품ID:', productInfo.product_id);
    
    // ========== STEP 2: 썸네일 클릭 ==========
    updateProgress(10, '2/7 썸네일 클릭 중...');
    
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: clickAllThumbnailsOnly
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // ========== STEP 3: 썸네일 Canvas 캡처 ==========
    updateProgress(20, '3/7 썸네일 캡처 중...');
    
    const thumbResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureThumbnailsWithCanvas
    });
    
    const thumbnails = thumbResult?.[0]?.result || [];
    console.log(`=== 썸네일 캡처 완료: ${thumbnails.length}개 ===`);
    
    updateProgress(35, `썸네일 ${thumbnails.length}개 캡처 완료`);
    updateStats(thumbnails.length, 0, productInfo.options?.length || 0);
    
    // 썸네일 캡처 확인
    if (thumbnails.length === 0) {
      console.log('⚠️ 썸네일 캡처 실패, 계속 진행...');
    } else {
      console.log('✅ 썸네일 캡처 성공!');
    }
    
    // ========== STEP 4: 페이지 스크롤 (상세 이미지 로딩) ==========
    updateProgress(40, '4/7 상세 페이지 스크롤 중...');
    
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrollPageForDetailImages
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // ========== STEP 5: 상세 이미지 URL 추출 ==========
    updateProgress(50, '5/7 상세 이미지 URL 추출 중...');
    
    const detailUrlResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractDetailImageUrls
    });
    
    const detailUrls = detailUrlResult?.[0]?.result || [];
    console.log(`=== 상세 이미지 URL: ${detailUrls.length}개 ===`);
    detailUrls.slice(0, 5).forEach((url, i) => console.log(`  ${i+1}: ${url.substring(0, 70)}...`));
    
    // ========== STEP 6: 상세 이미지 다운로드 (background.js) ==========
    updateProgress(55, '6/7 상세 이미지 다운로드 중...');
    
    let detailImages = [];
    if (detailUrls.length > 0) {
      console.log('상세 이미지 다운로드 시작...');
      
      try {
        const downloadResult = await chrome.runtime.sendMessage({
          action: 'downloadImages',
          urls: detailUrls.slice(0, 30)
        });
        
        console.log('다운로드 응답:', downloadResult);
        
        if (downloadResult?.success && downloadResult?.data) {
          detailImages = downloadResult.data
            .filter(r => r && r.success && r.data)
            .map(r => r.data);
          console.log(`상세 다운로드 성공: ${detailImages.length}개`);
        }
      } catch (e) {
        console.log('상세 다운로드 오류:', e.message);
      }
    }
    
    updateProgress(75, `상세 ${detailImages.length}개 다운로드 완료`);
    updateStats(thumbnails.length, detailImages.length, productInfo.options?.length || 0);
    
    // 상세 이미지 다운로드 확인
    if (detailImages.length === 0 && detailUrls.length > 0) {
      console.log('⚠️ 상세 이미지 다운로드 실패');
    } else if (detailImages.length > 0) {
      console.log('✅ 상세 이미지 다운로드 성공!');
    }
    
    // ========== STEP 7: 서버 전송 ==========
    updateProgress(80, '7/7 서버로 전송 중...');
    
    // 환율 조회
    let exchangeRate = 190;
    try {
      const rateResult = await chrome.runtime.sendMessage({ action: 'getExchangeRate' });
      if (rateResult?.success) exchangeRate = rateResult.rate;
    } catch (e) {}
    
    const dataToSend = {
      product_id: productInfo.product_id,
      title: productInfo.title,
      price: productInfo.price,
      shop_name: productInfo.shop_name,
      exchange_rate: exchangeRate,
      thumbnails: thumbnails,
      detailImages: detailImages,
      options: productInfo.options || [],
      source_url: tab.url,
      collected_at: new Date().toISOString()
    };
    
    console.log('=== 서버 전송 ===');
    console.log(`썸네일: ${thumbnails.length}개, 상세: ${detailImages.length}개`);
    
    const response = await fetch(`${serverUrl}/api/products/from-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataToSend)
    });
    
    const serverResult = await response.json();
    console.log('서버 응답:', serverResult);
    
    if (response.ok && serverResult.status === 'success') {
      updateProgress(100, '✅ 완료!');
      updateStats(serverResult.thumbnails_saved, serverResult.details_saved, productInfo.options?.length || 0);
      
      document.getElementById('resultTitle').textContent = productInfo.title || '상품명 없음';
      document.getElementById('resultPrice').textContent = `¥${productInfo.price || 0} (₩${Math.round((productInfo.price || 0) * exchangeRate).toLocaleString()})`;
      
      const previewDiv = document.getElementById('previewImages');
      if (serverResult.images?.length > 0) {
        previewDiv.innerHTML = serverResult.images.slice(0, 8).map(url => 
          `<img src="${serverUrl}${url}" onerror="this.style.display='none'">`
        ).join('');
      }
      
      document.getElementById('resultCard').classList.add('show');
      showMessage(`✅ 저장 완료! 썸네일 ${serverResult.thumbnails_saved}개, 상세 ${serverResult.details_saved}개`, 'success');
    } else {
      throw new Error(serverResult.error || '서버 저장 실패');
    }
    
  } catch (error) {
    console.error('수집 오류:', error);
    updateProgress(0, '❌ 오류 발생');
    showMessage(`오류: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 상품 정보 수집 시작';
  }
}

// =====================================================
// [별도 함수 1] 기본 상품 정보만 추출
// =====================================================

function extractBasicProductInfo() {
  console.log('=== 기본 정보 추출 ===');
  
  const data = {
    product_id: new URLSearchParams(window.location.search).get('id') || Date.now().toString(),
    title: null,
    price: null,
    shop_name: null,
    options: []
  };
  
  // 제목
  for (const sel of ['h1', '[class*="mainTitle"]', '.tb-main-title']) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()?.length > 5) {
      data.title = el.textContent.trim().substring(0, 200);
      break;
    }
  }
  
  // 가격
  for (const sel of ['[class*="Price--priceText"]', '[class*="priceText"]', '.tm-price', '.tb-rmb-num']) {
    const el = document.querySelector(sel);
    if (el) {
      const match = el.textContent.match(/[\d.]+/);
      if (match) {
        data.price = parseFloat(match[0]);
        break;
      }
    }
  }
  if (!data.price) {
    const yenMatch = document.body.innerText.match(/[¥￥]\s*(\d+\.?\d*)/);
    if (yenMatch) data.price = parseFloat(yenMatch[1]);
  }
  
  // 상점명
  for (const sel of ['[class*="ShopHeader--title"]', '.shop-name', '.tb-seller-name']) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) {
      data.shop_name = el.textContent.trim();
      break;
    }
  }
  
  // ===== 옵션 추출 =====
  console.log('=== 옵션 추출 시작 ===');
  
  // 페이지에서 SKU 데이터 찾기
  let skuPriceMap = {};  // skuId -> {price, quantity}
  let vidToSkuMap = {};  // vid -> skuId
  
  // script 태그에서 __ICE_APP_CONTEXT__ 찾기
  try {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      
      if (!text.includes('__ICE_APP_CONTEXT__')) continue;
      if (!text.includes('sku2info')) continue;
      
      console.log('__ICE_APP_CONTEXT__ 스크립트 발견!');
      
      // ===== 1. sku2info에서 가격/재고 추출 =====
      // 패턴: "5687256985173":{"moreQuantity":"true","quantity":200,...,"price":{..."priceText":"7.44"...}
      // quantity와 price 사이에 다른 필드들이 있을 수 있음!
      console.log('sku2info 파싱 시작...');
      
      // 먼저 모든 SKU ID 찾기 (13자리)
      const allSkuIds = new Set();
      const skuIdPattern = /"(\d{13})"\s*:\s*\{/g;
      let idMatch;
      while ((idMatch = skuIdPattern.exec(text)) !== null) {
        allSkuIds.add(idMatch[1]);
      }
      console.log(`발견된 SKU ID: ${allSkuIds.size}개`);
      
      // 각 SKU ID에 대해 quantity와 priceText 개별 추출
      for (const skuId of allSkuIds) {
        // quantity 찾기 - skuId 블록 내에서
        const quantityPattern = new RegExp(`"${skuId}"\\s*:\\s*\\{[^}]*?"quantity"\\s*:\\s*(\\d+)`);
        const quantityMatch = text.match(quantityPattern);
        
        // priceText 찾기 - skuId 블록 내의 price 객체에서
        // 더 넓은 범위에서 검색 (중첩 객체 허용)
        const startIdx = text.indexOf(`"${skuId}":`);
        if (startIdx === -1) continue;
        
        // 해당 블록의 끝 찾기 (다음 skuId 시작 전까지)
        let endIdx = text.length;
        for (const otherId of allSkuIds) {
          if (otherId === skuId) continue;
          const otherIdx = text.indexOf(`"${otherId}":`, startIdx + 20);
          if (otherIdx > startIdx && otherIdx < endIdx) {
            endIdx = otherIdx;
          }
        }
        
        const block = text.substring(startIdx, endIdx);
        const priceTextMatch = block.match(/"price"\s*:\s*\{[^}]*?"priceText"\s*:\s*"([^"]+)"/);
        
        if (quantityMatch && priceTextMatch) {
          const quantity = parseInt(quantityMatch[1]);
          const priceText = priceTextMatch[1].replace('起', '');
          
          skuPriceMap[skuId] = { price: priceText, quantity };
          console.log(`  SKU ${skuId}: ¥${priceText}, 재고 ${quantity}`);
        }
      }
      
      console.log(`가격 정보 ${Object.keys(skuPriceMap).length}개 추출`);
      
      // ===== 2. skus에서 vid -> skuId 매핑 =====
      // 패턴: {"propPath":"1627207:23094317651","skuId":"5687256985173"}
      // vid는 8자리 이상 가능!
      console.log('skus 매핑 파싱 시작...');
      
      const skuMappingPattern = /"propPath"\s*:\s*"([^"]+)"\s*,\s*"skuId"\s*:\s*"(\d+)"/g;
      let mapMatch;
      while ((mapMatch = skuMappingPattern.exec(text)) !== null) {
        const propPath = mapMatch[1];
        const skuId = mapMatch[2];
        
        // propPath: "1627207:23094317651" 또는 "1627207:12459086"
        const parts = propPath.split(';');
        parts.forEach(part => {
          const colonIdx = part.lastIndexOf(':');
          if (colonIdx > 0) {
            const vid = part.substring(colonIdx + 1);
            vidToSkuMap[vid] = skuId;
          }
        });
      }
      
      console.log(`vid->skuId 매핑 ${Object.keys(vidToSkuMap).length}개`);
      console.log('매핑 내용:', JSON.stringify(vidToSkuMap));
      
      // ===== 3. props에서 옵션값 추출 =====
      console.log('props 파싱 시작...');
      
      // props 배열에서 name 찾기
      const propsNameMatch = text.match(/"props"\s*:\s*\[\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
      const optionName = propsNameMatch ? propsNameMatch[1] : '옵션';
      
      console.log(`옵션 이름: ${optionName}`);
      
      // values 배열의 각 항목 추출
      const option = { name: optionName, values: [] };
      const processedVids = new Set();
      
      // 패턴1: vid, image, name 순서 (image가 name 앞에 오는 경우)
      const valuePattern1 = /"vid"\s*:\s*"(\d+)"\s*,\s*"image"\s*:\s*"([^"]*)"\s*,\s*"name"\s*:\s*"([^"]+)"/g;
      let valMatch;
      
      while ((valMatch = valuePattern1.exec(text)) !== null) {
        const vid = valMatch[1];
        if (processedVids.has(vid)) continue;
        processedVids.add(vid);
        
        let image = valMatch[2] || null;
        const name = valMatch[3];
        
        if (image && image.startsWith('//')) image = 'https:' + image;
        
        const skuId = vidToSkuMap[vid];
        const priceInfo = skuPriceMap[skuId];
        
        option.values.push({
          name: name,
          image: image,
          quantity: priceInfo?.quantity ?? null,
          price: priceInfo?.price || null
        });
        
        console.log(`  ${name}: vid=${vid}, skuId=${skuId}, ¥${priceInfo?.price || '없음'}, 재고 ${priceInfo?.quantity ?? '없음'}`);
      }
      
      // 패턴2: comboPropertyValue, vid, image, name 순서 (values 배열 내)
      if (option.values.length === 0) {
        const valuePattern2 = /"comboPropertyValue"\s*:\s*"[^"]*"\s*,\s*"vid"\s*:\s*"(\d+)"\s*,\s*"image"\s*:\s*"([^"]*)"\s*,\s*"name"\s*:\s*"([^"]+)"/g;
        while ((valMatch = valuePattern2.exec(text)) !== null) {
          const vid = valMatch[1];
          if (processedVids.has(vid)) continue;
          processedVids.add(vid);
          
          let image = valMatch[2] || null;
          const name = valMatch[3];
          
          if (image && image.startsWith('//')) image = 'https:' + image;
          
          const skuId = vidToSkuMap[vid];
          const priceInfo = skuPriceMap[skuId];
          
          option.values.push({
            name: name,
            image: image,
            quantity: priceInfo?.quantity ?? null,
            price: priceInfo?.price || null
          });
          
          console.log(`  ${name}: vid=${vid}, skuId=${skuId}, ¥${priceInfo?.price || '없음'}`);
        }
      }
      
      if (option.values.length > 0) {
        data.options.push(option);
        console.log(`=== 옵션 추출 완료: ${option.values.length}개 값 ===`);
      } else {
        console.log('JSON에서 옵션 추출 실패, DOM fallback 시도...');
      }
      
      break;  // 첫 번째 매칭 스크립트만 처리
    }
  } catch (e) {
    console.log('script 파싱 오류:', e.message);
  }
  
  // 방법 2: DOM에서 직접 추출 (fallback)
  if (data.options.length === 0) {
    console.log('DOM에서 옵션 추출 시도...');
    
    // 디버깅: 페이지의 SKU 관련 요소 출력
    console.log('=== DOM 디버깅 ===');
    const debugSelectors = [
      '[class*="Sku"]',
      '[class*="sku"]',
      '[class*="prop"]',
      '[class*="Prop"]',
      '[class*="value"]',
      '[class*="Value"]'
    ];
    debugSelectors.forEach(sel => {
      const els = document.querySelectorAll(sel);
      if (els.length > 0 && els.length < 20) {
        console.log(`${sel}: ${els.length}개`);
        els.forEach((el, i) => {
          if (i < 3) console.log(`  ${i}: ${el.className?.substring(0, 80)}`);
        });
      }
    });
    
    // ===== 타오바오 신규 UI 셀렉터 (2024~) =====
    
    // skuItem 찾기 (옵션 그룹)
    const skuItems = document.querySelectorAll('[class*="skuItem--"]');
    console.log(`skuItem 발견: ${skuItems.length}개`);
    
    skuItems.forEach((skuItem, idx) => {
      const opt = { name: '', values: [] };
      
      // 옵션 이름: skuItem 내부의 첫 번째 텍스트 또는 title 요소
      const titleEl = skuItem.querySelector('[class*="title"], [class*="Title"], [class*="name"], [class*="label"]');
      if (titleEl) {
        opt.name = titleEl.textContent.replace(/[:：\(\)（）\d]/g, '').trim();
      }
      
      // 옵션 이름이 없으면 skuItem 자체의 첫 텍스트 노드 확인
      if (!opt.name) {
        const walker = document.createTreeWalker(skuItem, NodeFilter.SHOW_TEXT, null, false);
        let textNode;
        while (textNode = walker.nextNode()) {
          const text = textNode.textContent.trim();
          if (text && text.length > 0 && text.length < 20) {
            opt.name = text.replace(/[:：\(\)（）\d]/g, '').trim();
            break;
          }
        }
      }
      
      console.log(`  skuItem ${idx + 1}: 이름="${opt.name}"`);
      
      // 옵션 값들: skuValueWrap 또는 valueItem 찾기
      const valueWraps = skuItem.querySelectorAll('[class*="skuValueWrap"], [class*="valueWrap"], [class*="valueItem"], [class*="ValueItem"]');
      console.log(`    valueWrap 개수: ${valueWraps.length}`);
      
      if (valueWraps.length > 0) {
        valueWraps.forEach(wrap => {
          // 각 옵션 값 버튼/스팬
          const valueButtons = wrap.querySelectorAll('[class*="value"], button, span, a');
          valueButtons.forEach(btn => {
            const text = btn.textContent.trim();
            // 유효한 옵션값인지 확인
            if (text && text.length > 0 && text.length < 50 
                && !text.includes('¥') && !text.includes('件') 
                && !text.includes('库存') && text !== opt.name) {
              const img = btn.querySelector('img');
              let imgUrl = img?.src || null;
              if (imgUrl?.startsWith('//')) imgUrl = 'https:' + imgUrl;
              
              // 중복 체크
              if (!opt.values.find(v => v.name === text)) {
                opt.values.push({
                  name: text,
                  image: imgUrl,
                  quantity: null,
                  price: null
                });
              }
            }
          });
        });
      }
      
      // valueWrap이 없으면 직접 자식 요소에서 찾기
      if (opt.values.length === 0) {
        const allChildren = skuItem.querySelectorAll('*');
        allChildren.forEach(el => {
          if (el.children.length === 0) { // 말단 노드만
            const text = el.textContent.trim();
            if (text && text.length > 0 && text.length < 30 
                && !text.includes('¥') && !text.includes('件')
                && text !== opt.name) {
              if (!opt.values.find(v => v.name === text)) {
                const img = el.querySelector('img') || el.closest('[class*="value"]')?.querySelector('img');
                let imgUrl = img?.src || null;
                if (imgUrl?.startsWith('//')) imgUrl = 'https:' + imgUrl;
                
                opt.values.push({
                  name: text,
                  image: imgUrl,
                  quantity: null,
                  price: null
                });
              }
            }
          }
        });
      }
      
      console.log(`    추출된 값: ${opt.values.length}개`);
      opt.values.forEach(v => console.log(`      - ${v.name}`));
      
      if (opt.name && opt.values.length > 0) {
        data.options.push(opt);
      }
    });
    
    // ===== Fallback: skuWrapper에서 찾기 =====
    if (data.options.length === 0) {
      console.log('skuWrapper에서 검색...');
      
      const skuWrapper = document.querySelector('[class*="skuWrapper"]');
      if (skuWrapper) {
        // 모든 옵션 값 요소 찾기
        const allValueEls = skuWrapper.querySelectorAll('[class*="value"], button, [role="button"]');
        console.log(`skuWrapper 내 값 요소: ${allValueEls.length}개`);
        
        const opt = { name: '옵션', values: [] };
        allValueEls.forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length > 0 && text.length < 30 
              && !text.includes('¥') && !text.includes('件')) {
            if (!opt.values.find(v => v.name === text)) {
              const img = el.querySelector('img');
              let imgUrl = img?.src || null;
              if (imgUrl?.startsWith('//')) imgUrl = 'https:' + imgUrl;
              
              opt.values.push({ name: text, image: imgUrl, quantity: null, price: null });
            }
          }
        });
        
        if (opt.values.length > 0) {
          data.options.push(opt);
        }
      }
    }
    
    // ===== Fallback: GeneralSkuPanel에서 찾기 =====
    if (data.options.length === 0) {
      console.log('GeneralSkuPanel에서 검색...');
      
      const skuPanel = document.querySelector('[class*="GeneralSkuPanel"], [class*="SkuPanel"]');
      if (skuPanel) {
        const opt = { name: '색상/규격', values: [] };
        
        // 이미지가 있는 옵션 버튼들
        const imgButtons = skuPanel.querySelectorAll('img');
        imgButtons.forEach(img => {
          const parent = img.closest('[class*="value"], button, [role="button"], span');
          if (parent) {
            const text = parent.textContent.trim();
            let imgUrl = img.src;
            if (imgUrl?.startsWith('//')) imgUrl = 'https:' + imgUrl;
            
            if (text && text.length < 30 && !opt.values.find(v => v.name === text)) {
              opt.values.push({ name: text || '옵션', image: imgUrl, quantity: null, price: null });
            }
          }
        });
        
        // 텍스트만 있는 옵션 버튼들
        if (opt.values.length === 0) {
          const buttons = skuPanel.querySelectorAll('button, [role="button"], [class*="value"]');
          buttons.forEach(btn => {
            const text = btn.textContent.trim();
            if (text && text.length > 0 && text.length < 30 && !text.includes('¥')) {
              if (!opt.values.find(v => v.name === text)) {
                opt.values.push({ name: text, image: null, quantity: null, price: null });
              }
            }
          });
        }
        
        if (opt.values.length > 0) {
          data.options.push(opt);
        }
      }
    }
    
    // 추가 fallback: 모든 SKU 관련 요소
    if (data.options.length === 0) {
      console.log('추가 DOM 검색...');
      
      // 색상/사이즈 등 일반적인 옵션 영역
      document.querySelectorAll('[class*="Sku"], [class*="sku"], .tb-sku').forEach(area => {
        const rows = area.querySelectorAll('[class*="row"], [class*="item"], dl, li');
        rows.forEach(row => {
          const labelEl = row.querySelector('[class*="label"], [class*="title"], dt');
          const valuesEl = row.querySelectorAll('[class*="value"], dd a, button, span');
          
          if (labelEl && valuesEl.length > 0) {
            const opt = { 
              name: labelEl.textContent.replace(/[:：]/g, '').trim(), 
              values: [] 
            };
            
            valuesEl.forEach(v => {
              const text = v.textContent.trim();
              if (text && text.length > 0 && text.length < 30) {
                opt.values.push({ name: text, quantity: null, price: null });
              }
            });
            
            if (opt.name && opt.values.length > 0) {
              data.options.push(opt);
            }
          }
        });
      });
    }
  }
  
  console.log(`=== 옵션 추출 완료: ${data.options.length}개 ===`);
  console.log('추출 완료:', data);
  return data;
}

// =====================================================
// [별도 함수 2] 썸네일 클릭만
// =====================================================

async function clickAllThumbnailsOnly() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  console.log('=== 썸네일 클릭 시작 ===');
  window.scrollTo(0, 0);
  await sleep(300);
  
  const selectors = [
    '[class*="thumbnail--"] > div',
    '[class*="thumbnails--"] > div',
    '[class*="thumbnails"] > div > div',
    '.tb-thumb li',
    '#J_UlThumb li'
  ];
  
  for (const selector of selectors) {
    const items = document.querySelectorAll(selector);
    if (items.length === 0) continue;
    
    console.log(`썸네일 발견: ${selector}, ${items.length}개`);
    
    for (let i = 0; i < Math.min(items.length, 10); i++) {
      const item = items[i];
      item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(150);
      item.click();
      await sleep(300);
      console.log(`썸네일 ${i + 1}/${items.length} 클릭`);
    }
    break;
  }
  
  console.log('=== 썸네일 클릭 완료 ===');
}

// =====================================================
// [별도 함수 3] 썸네일 Canvas 캡처만
// =====================================================

async function captureThumbnailsWithCanvas() {
  console.log('=== 썸네일 Canvas 캡처 시작 ===');
  
  const thumbnails = [];
  const capturedSrcs = new Set();
  
  const captureImage = (img) => {
    return new Promise((resolve) => {
      try {
        if (!img.complete || img.naturalWidth === 0) {
          resolve(null);
          return;
        }
        
        // 방법 1: crossOrigin으로 시도
        const testImg = new Image();
        testImg.crossOrigin = 'anonymous';
        
        testImg.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = testImg.naturalWidth;
            canvas.height = testImg.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(testImg, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg', 0.9);
            if (base64.length > 1000) {
              console.log(`✅ 캡처 성공: ${testImg.naturalWidth}x${testImg.naturalHeight}`);
              resolve(base64);
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        };
        
        testImg.onerror = () => {
          // 방법 2: 원본 이미지 직접 사용
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg', 0.9);
            if (base64.length > 1000) {
              console.log(`✅ 캡처 성공 (원본): ${img.naturalWidth}x${img.naturalHeight}`);
              resolve(base64);
            } else {
              resolve(null);
            }
          } catch (e) {
            console.log('❌ 캡처 실패:', e.message);
            resolve(null);
          }
        };
        
        testImg.src = img.src;
        setTimeout(() => resolve(null), 3000);
        
      } catch (error) {
        resolve(null);
      }
    });
  };
  
  const selectors = [
    '[class*="thumbnailItem"] img',
    '[class*="thumbnail--"] img',
    '[class*="thumbnails"] img',
    '.tb-thumb img',
    '#J_UlThumb img'
  ];
  
  for (const sel of selectors) {
    const imgs = document.querySelectorAll(sel);
    if (imgs.length === 0) continue;
    
    console.log(`셀렉터 ${sel}: ${imgs.length}개 이미지`);
    
    for (const img of imgs) {
      const srcKey = (img.src || '').split('?')[0];
      if (!srcKey || capturedSrcs.has(srcKey)) continue;
      if (img.naturalWidth < 50 || img.naturalHeight < 50) continue;
      
      capturedSrcs.add(srcKey);
      
      const base64 = await captureImage(img);
      if (base64) {
        thumbnails.push(base64);
        console.log(`썸네일 ${thumbnails.length}개 완료`);
      }
      
      if (thumbnails.length >= 10) break;
    }
    
    if (thumbnails.length > 0) break;
  }
  
  console.log(`=== 썸네일 캡처 완료: ${thumbnails.length}개 ===`);
  return thumbnails;
}

// =====================================================
// [별도 함수 4] 페이지 스크롤만 (상세 이미지 로딩용)
// =====================================================

async function scrollPageForDetailImages() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  console.log('=== 상세 페이지 스크롤 시작 ===');
  
  const totalHeight = document.documentElement.scrollHeight;
  let pos = 0;
  
  while (pos < totalHeight) {
    pos += window.innerHeight * 0.5;
    window.scrollTo(0, pos);
    await sleep(300);
  }
  
  // 상세 영역 찾아서 추가 스크롤
  const descSelectors = ['#J_DivItemDesc', '[class*="descContent"]', '#detail', '#description'];
  for (const sel of descSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      await sleep(1000);
      break;
    }
  }
  
  // 추가 대기 (이미지 로딩)
  await sleep(1500);
  
  window.scrollTo(0, 0);
  console.log('=== 상세 페이지 스크롤 완료 ===');
}

// =====================================================
// [별도 함수 5] 상세 이미지 URL 추출만 (iframe 포함)
// =====================================================

function extractDetailImageUrls() {
  console.log('=== 상세 이미지 URL 추출 시작 ===');
  
  const detailUrls = new Set();
  
  // URL 추가 헬퍼 함수
  const addImageUrl = (img) => {
    let url = img.src || img.dataset.src || img.getAttribute('data-ks-lazyload') || img.getAttribute('data-src');
    if (!url || url.length < 30) return;
    if (url.includes('data:image')) return;
    if (url.includes('.gif')) return;
    
    if (url.startsWith('//')) url = 'https:' + url;
    
    if (url.includes('alicdn') || url.includes('tbcdn')) {
      detailUrls.add(url);
    }
  };
  
  // 1. 메인 페이지에서 검색
  const mainSelectors = [
    '#J_DivItemDesc img',
    '[class*="descContent"] img',
    '[class*="desc-content"] img',
    '#detail img',
    '#description img',
    '.detail-content img',
    '[class*="ItemDesc"] img'
  ];
  
  for (const sel of mainSelectors) {
    const imgs = document.querySelectorAll(sel);
    if (imgs.length > 0) {
      console.log(`메인 페이지 ${sel}: ${imgs.length}개`);
      imgs.forEach(addImageUrl);
    }
  }
  
  // 2. 모든 iframe 내부 검색
  const iframes = document.querySelectorAll('iframe');
  console.log(`iframe 개수: ${iframes.length}개`);
  
  iframes.forEach((iframe, idx) => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        console.log(`iframe ${idx + 1}: 접근 불가 (cross-origin)`);
        return;
      }
      
      // iframe 내부의 모든 img 태그
      const iframeImgs = iframeDoc.querySelectorAll('img');
      console.log(`iframe ${idx + 1}: ${iframeImgs.length}개 이미지 발견`);
      
      iframeImgs.forEach(addImageUrl);
      
    } catch (e) {
      console.log(`iframe ${idx + 1}: 접근 오류 - ${e.message}`);
    }
  });
  
  // 3. 페이지 내 모든 큰 이미지 검색 (fallback)
  if (detailUrls.size === 0) {
    console.log('iframe에서 못 찾음, 페이지 전체 검색...');
    
    document.querySelectorAll('img').forEach(img => {
      // 상세 영역 근처의 큰 이미지만
      if (img.naturalWidth >= 400 || img.width >= 400) {
        addImageUrl(img);
      }
    });
  }
  
  const result = Array.from(detailUrls).slice(0, 30);
  console.log(`=== 상세 URL 추출 완료: ${result.length}개 ===`);
  result.slice(0, 5).forEach((url, i) => console.log(`  ${i+1}: ${url.substring(0, 70)}...`));
  
  return result;
}
