import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import Redis from 'ioredis';
import { TranslationServiceClient } from '@google-cloud/translate';
import multer from 'multer';
import schedule from 'node-schedule';
import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';
import sharp from 'sharp';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Redis 연결
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// 이미지 다운로드 함수
async function downloadImage(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://item.taobao.com/'
            }
        });

        if (!response.ok) {
            console.log(`   ⚠️ 이미지 다운로드 실패: ${response.status} ${response.statusText}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error: any) {
        console.log(`   ❌ 이미지 다운로드 오류: ${error.message}`);
        return null;
    }
}

// Google Cloud Translation 클라이언트
let translationClient: TranslationServiceClient | null = null;
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID || '';
const GOOGLE_LOCATION = 'global';
const GLOSSARY_ID = process.env.GOOGLE_GLOSSARY_ID || 'taobao-glossary';

// Google Cloud 인증 확인
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_PROJECT_ID) {
    try {
        translationClient = new TranslationServiceClient();
        console.log('✅ Google Cloud Translation API 연결됨');
    } catch (e) {
        console.log('⚠️ Google Cloud Translation API 연결 실패, 사전 번역 사용');
    }
} else {
    console.log('⚠️ Google Cloud 인증 미설정, 사전 번역 사용');
}

// 이미지 저장 디렉토리 (절대 경로로 설정)
const STORAGE_DIR = '/app/storage/images';

console.log('========================================');
console.log('🚀 서버 시작 중...');
console.log(`📁 이미지 저장 경로: ${STORAGE_DIR}`);

// 저장 디렉토리 생성 및 권한 확인
try {
    if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o755 });
        console.log(`✅ 저장 디렉토리 생성됨: ${STORAGE_DIR}`);
    } else {
        console.log(`✅ 저장 디렉토리 존재함: ${STORAGE_DIR}`);
    }
    
    // 쓰기 권한 테스트
    const testFile = path.join(STORAGE_DIR, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('✅ 저장 디렉토리 쓰기 권한 확인됨');
} catch (error) {
    console.error('❌ 저장 디렉토리 오류:', error);
}
console.log('========================================');

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

// 큰 요청 바디 허용 (Base64 이미지용)
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// 요청 로깅
app.use((req, res, next) => {
    const contentLength = req.headers['content-length'];
    console.log(`📨 ${req.method} ${req.path} (${contentLength ? Math.round(parseInt(contentLength)/1024) + 'KB' : 'unknown'})`);
    next();
});

// API 테스트 라우트 (서버 동작 확인용)
app.get('/api/test', (req, res) => {
    console.log('🧪 테스트 API 호출됨');
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: 'v5.8',
        env: {
            naverClientId: process.env.NAVER_CLIENT_ID ? '설정됨' : '미설정',
            naverClientSecret: process.env.NAVER_CLIENT_SECRET ? '설정됨' : '미설정'
        }
    });
});

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, '../public')));
app.use('/images', express.static(STORAGE_DIR));

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        storage_dir: STORAGE_DIR,
        storage_exists: fs.existsSync(STORAGE_DIR),
        timestamp: new Date().toISOString()
    });
});

// 저장된 파일 목록 확인 API
app.get('/api/debug/files', (req, res) => {
    try {
        const listFiles = (dir: string, prefix = ''): string[] => {
            const files: string[] = [];
            if (!fs.existsSync(dir)) return files;
            
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    files.push(...listFiles(fullPath, `${prefix}${item}/`));
                } else {
                    files.push(`${prefix}${item} (${Math.round(stat.size/1024)}KB)`);
                }
            }
            return files;
        };
        
        const files = listFiles(STORAGE_DIR);
        res.json({
            storage_dir: STORAGE_DIR,
            total_files: files.length,
            files: files
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// 상품 저장 API (이미지 포함) - 디버깅 강화
// =====================================================

app.post('/api/products/from-extension', async (req, res) => {
    console.log('\n========================================');
    console.log('📥 상품 데이터 수신 시작');
    console.log('========================================');
    
    try {
        const productData = req.body;
        
        // 1. 수신 데이터 확인
        console.log('📋 수신된 데이터:');
        console.log(`   - 상품명: ${productData.title || '없음'}`);
        console.log(`   - 가격: ¥${productData.price || '없음'}`);
        console.log(`   - 상품ID: ${productData.product_id || '없음'}`);
        console.log(`   - 썸네일 배열: ${productData.thumbnails ? productData.thumbnails.length + '개' : '없음'}`);
        console.log(`   - 상세이미지 배열: ${productData.detailImages ? productData.detailImages.length + '개' : '없음'}`);
        console.log(`   - 옵션: ${productData.options ? productData.options.length + '개' : '없음'}`);
        
        // 썸네일 데이터 샘플 확인
        if (productData.thumbnails && productData.thumbnails.length > 0) {
            const sample = productData.thumbnails[0];
            console.log(`   - 썸네일 샘플 타입: ${typeof sample}`);
            if (typeof sample === 'string') {
                console.log(`   - 썸네일 샘플 길이: ${sample.length}자`);
                console.log(`   - 썸네일 샘플 시작: ${sample.substring(0, 50)}...`);
            }
        }
        
        // 2. 상품 ID 결정
        const productId = productData.product_id || 
            productData.source_url?.match(/id=(\d+)/)?.[1] || 
            Date.now().toString();
        console.log(`\n📌 상품 ID: ${productId}`);
        
        // 3. 디렉토리 생성
        const productDir = path.join(STORAGE_DIR, productId);
        console.log(`📁 상품 디렉토리: ${productDir}`);
        
        if (!fs.existsSync(productDir)) {
            fs.mkdirSync(productDir, { recursive: true, mode: 0o755 });
            console.log('   ✅ 디렉토리 생성됨');
        } else {
            console.log('   ✅ 디렉토리 이미 존재');
        }
        
        // 4. 썸네일 이미지 저장
        const savedThumbnails: string[] = [];
        if (productData.thumbnails && Array.isArray(productData.thumbnails) && productData.thumbnails.length > 0) {
            console.log('\n🖼️ 썸네일 저장 시작...');
            
            const thumbDir = path.join(productDir, 'thumbnails');
            if (!fs.existsSync(thumbDir)) {
                fs.mkdirSync(thumbDir, { recursive: true, mode: 0o755 });
            }
            console.log(`   📁 썸네일 디렉토리: ${thumbDir}`);
            
            for (let i = 0; i < productData.thumbnails.length; i++) {
                const imgData = productData.thumbnails[i];

                if (!imgData) {
                    console.log(`   ⚠️ 썸네일 ${i+1}: 데이터 없음`);
                    continue;
                }

                try {
                    let buffer: Buffer | null = null;
                    let ext = 'jpg';

                    if (typeof imgData === 'string') {
                        // URL인 경우 다운로드
                        if (imgData.startsWith('http://') || imgData.startsWith('https://')) {
                            console.log(`   🌐 썸네일 ${i+1}: URL 다운로드 중...`);
                            buffer = await downloadImage(imgData);

                            // URL에서 확장자 추출 시도
                            const urlExt = imgData.match(/\.(jpg|jpeg|png|gif|webp)($|\?)/i);
                            if (urlExt) {
                                ext = urlExt[1].toLowerCase() === 'jpeg' ? 'jpg' : urlExt[1].toLowerCase();
                            }
                        }
                        // data URL인 경우
                        else if (imgData.startsWith('data:image/')) {
                            const matches = imgData.match(/^data:image\/(\w+);base64,(.+)$/);
                            if (matches) {
                                ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                                buffer = Buffer.from(matches[2], 'base64');
                                console.log(`   📸 썸네일 ${i+1}: data URL 파싱 성공 (${ext})`);
                            } else {
                                console.log(`   ⚠️ 썸네일 ${i+1}: data URL 파싱 실패`);
                            }
                        }
                        // 순수 Base64 데이터
                        else if (imgData.startsWith('/9j/') || imgData.startsWith('iVBOR')) {
                            buffer = Buffer.from(imgData, 'base64');
                            ext = imgData.startsWith('/9j/') ? 'jpg' : 'png';
                            console.log(`   📸 썸네일 ${i+1}: 순수 Base64 (${ext})`);
                        } else {
                            console.log(`   ⚠️ 썸네일 ${i+1}: 알 수 없는 형식`);
                            console.log(`      시작부분: ${imgData.substring(0, 50)}`);
                        }
                    } else {
                        console.log(`   ⚠️ 썸네일 ${i+1}: 문자열이 아님 (${typeof imgData})`);
                    }

                    if (buffer && buffer.length > 0) {
                        const filename = `thumb_${String(i + 1).padStart(3, '0')}.${ext}`;
                        const filepath = path.join(thumbDir, filename);

                        console.log(`   💾 썸네일 ${i+1}: 버퍼 크기 ${Math.round(buffer.length/1024)}KB`);

                        fs.writeFileSync(filepath, buffer);

                        // 저장 확인
                        if (fs.existsSync(filepath)) {
                            const savedSize = fs.statSync(filepath).size;
                            console.log(`   ✅ 썸네일 ${i+1}: 저장 완료 (${Math.round(savedSize/1024)}KB) - ${filename}`);
                            savedThumbnails.push(`/images/${productId}/thumbnails/${filename}`);
                        } else {
                            console.log(`   ❌ 썸네일 ${i+1}: 파일이 생성되지 않음`);
                        }
                    }
                } catch (imgError: any) {
                    console.log(`   ❌ 썸네일 ${i+1}: 저장 실패 - ${imgError.message}`);
                }
            }
            
            console.log(`   📊 썸네일 저장 결과: ${savedThumbnails.length}/${productData.thumbnails.length}개`);
        } else {
            console.log('\n⚠️ 썸네일 데이터 없음');
        }
        
        // 5. 상세 이미지 저장
        const savedDetailImages: string[] = [];
        if (productData.detailImages && Array.isArray(productData.detailImages) && productData.detailImages.length > 0) {
            console.log('\n🖼️ 상세 이미지 저장 시작...');
            
            const detailDir = path.join(productDir, 'details');
            if (!fs.existsSync(detailDir)) {
                fs.mkdirSync(detailDir, { recursive: true, mode: 0o755 });
            }
            console.log(`   📁 상세 디렉토리: ${detailDir}`);
            
            for (let i = 0; i < productData.detailImages.length; i++) {
                const imgData = productData.detailImages[i];

                if (!imgData) {
                    continue;
                }

                try {
                    let buffer: Buffer | null = null;
                    let ext = 'jpg';

                    if (typeof imgData === 'string') {
                        // URL인 경우 다운로드
                        if (imgData.startsWith('http://') || imgData.startsWith('https://')) {
                            console.log(`   🌐 상세 ${i+1}: URL 다운로드 중...`);
                            buffer = await downloadImage(imgData);

                            // URL에서 확장자 추출 시도
                            const urlExt = imgData.match(/\.(jpg|jpeg|png|gif|webp)($|\?)/i);
                            if (urlExt) {
                                ext = urlExt[1].toLowerCase() === 'jpeg' ? 'jpg' : urlExt[1].toLowerCase();
                            }
                        }
                        // data URL인 경우
                        else if (imgData.startsWith('data:image/')) {
                            const matches = imgData.match(/^data:image\/(\w+);base64,(.+)$/);
                            if (matches) {
                                ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                                buffer = Buffer.from(matches[2], 'base64');
                            }
                        }
                        // 순수 Base64 데이터
                        else if (imgData.startsWith('/9j/') || imgData.startsWith('iVBOR')) {
                            buffer = Buffer.from(imgData, 'base64');
                            ext = imgData.startsWith('/9j/') ? 'jpg' : 'png';
                        }
                    }

                    if (buffer && buffer.length > 0) {
                        const filename = `detail_${String(i + 1).padStart(3, '0')}.${ext}`;
                        const filepath = path.join(detailDir, filename);

                        fs.writeFileSync(filepath, buffer);

                        if (fs.existsSync(filepath)) {
                            const savedSize = fs.statSync(filepath).size;
                            console.log(`   ✅ 상세 ${i+1}: 저장 완료 (${Math.round(savedSize/1024)}KB)`);
                            savedDetailImages.push(`/images/${productId}/details/${filename}`);
                        }
                    }
                } catch (imgError: any) {
                    console.log(`   ❌ 상세 ${i+1}: 저장 실패 - ${imgError.message}`);
                }
            }
            
            console.log(`   📊 상세 저장 결과: ${savedDetailImages.length}/${productData.detailImages.length}개`);
        } else {
            console.log('\n⚠️ 상세 이미지 데이터 없음');
        }
        
        // 6. 최종 확인 - 실제 저장된 파일 목록
        console.log('\n📁 저장된 파일 확인:');
        const checkDir = (dir: string) => {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                console.log(`   ${dir}: ${files.length}개 파일`);
                files.forEach(f => console.log(`      - ${f}`));
            }
        };
        checkDir(path.join(productDir, 'thumbnails'));
        checkDir(path.join(productDir, 'details'));
        
        // 7. 옵션 이미지 저장
        const savedOptions = productData.options || [];
        if (savedOptions.length > 0) {
            console.log('\n🎨 옵션 이미지 저장 시작...');
            const optionDir = path.join(productDir, 'options');
            if (!fs.existsSync(optionDir)) {
                fs.mkdirSync(optionDir, { recursive: true, mode: 0o755 });
            }
            
            let optionImageCount = 0;
            for (const opt of savedOptions) {
                for (const val of opt.values || []) {
                    if (val.imageData) {
                        try {
                            const imgData = val.imageData;
                            let base64Data: string | null = null;
                            let ext = 'jpg';
                            
                            if (typeof imgData === 'string' && imgData.startsWith('data:image/')) {
                                const matches = imgData.match(/^data:image\/(\w+);base64,(.+)$/);
                                if (matches) {
                                    ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                                    base64Data = matches[2];
                                }
                            }
                            
                            if (base64Data) {
                                const safeName = (val.name || 'option').replace(/[^a-zA-Z0-9가-힣]/g, '_').substring(0, 30);
                                const filename = `opt_${optionImageCount + 1}_${safeName}.${ext}`;
                                const filepath = path.join(optionDir, filename);
                                fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
                                val.image = `/images/${productId}/options/${filename}`;
                                optionImageCount++;
                            }
                        } catch (e) {}
                        delete val.imageData; // Base64 데이터 제거
                    }
                }
            }
            console.log(`   📊 옵션 이미지 저장: ${optionImageCount}개`);
        }
        
        // 8. Redis에 상품 정보 저장
        const productToSave = {
            product_id: productId,
            title: productData.title,
            price: productData.price,
            price_range: productData.price_range,
            original_price: productData.original_price,
            shop_name: productData.shop_name,
            shop_url: productData.shop_url,
            sales: productData.sales,
            exchange_rate: productData.exchange_rate || 190,
            options: savedOptions,
            source_url: productData.source_url,
            images: savedThumbnails,
            detail_images: savedDetailImages,
            status: 'saved',
            saved_at: new Date().toISOString()
        };
        
        await redis.set(`product:${productId}`, JSON.stringify(productToSave));
        await redis.sadd('products:list', productId);
        
        console.log('\n========================================');
        console.log(`✅ 상품 저장 완료: ${productId}`);
        console.log(`   - 썸네일: ${savedThumbnails.length}개`);
        console.log(`   - 상세: ${savedDetailImages.length}개`);
        console.log('========================================\n');
        
        res.json({
            status: 'success',
            message: '상품이 저장되었습니다',
            product_id: productId,
            thumbnails_saved: savedThumbnails.length,
            details_saved: savedDetailImages.length,
            images: [...savedThumbnails, ...savedDetailImages],
            debug: {
                thumbnails_received: productData.thumbnails?.length || 0,
                details_received: productData.detailImages?.length || 0,
                storage_dir: productDir
            }
        });
        
    } catch (error: any) {
        console.error('\n❌ 상품 저장 오류:', error);
        console.error('스택:', error.stack);
        res.status(500).json({ 
            error: '상품 저장 실패',
            message: error.message 
        });
    }
});

// 상품 목록 조회
app.get('/api/products/extracted', async (req, res) => {
    try {
        const productIds = await redis.smembers('products:list');
        const products = [];
        
        for (const id of productIds) {
            const productJson = await redis.get(`product:${id}`);
            if (productJson) {
                const product = JSON.parse(productJson);
                products.push({
                    product_id: id,
                    title: product.title,
                    price: product.price,
                    exchange_rate: product.exchange_rate,
                    thumbnail: product.images?.[0] || null,
                    images_count: product.images?.length || 0,
                    detail_images_count: product.detail_images?.length || 0,
                    options_count: product.options?.length || 0,
                    status: product.status,
                    saved_at: product.saved_at
                });
            }
        }
        
        products.sort((a, b) => 
            new Date(b.saved_at || 0).getTime() - new Date(a.saved_at || 0).getTime()
        );
        
        res.json({ products, total: products.length });
        
    } catch (error) {
        console.error('상품 조회 에러:', error);
        res.status(500).json({ error: '상품 조회 실패' });
    }
});

// 상품 상세 조회
app.get('/api/products/extracted/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const productJson = await redis.get(`product:${productId}`);
        
        if (!productJson) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }
        
        res.json(JSON.parse(productJson));
        
    } catch (error) {
        console.error('상품 상세 조회 에러:', error);
        res.status(500).json({ error: '상품 조회 실패' });
    }
});

// 이미지 순서 변경
app.put('/api/products/extracted/:productId/images', async (req, res) => {
    try {
        const { productId } = req.params;
        const { images } = req.body;
        
        if (!images || !Array.isArray(images)) {
            return res.status(400).json({ error: '이미지 배열이 필요합니다' });
        }
        
        // Redis에서 상품 정보 가져오기
        const data = await redis.get(`product:${productId}`);
        if (!data) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }
        
        const product = JSON.parse(data);
        
        // 이미지 순서 업데이트
        product.images = images;
        if (images.length > 0) {
            product.thumbnail = images[0];
        }
        
        // Redis에 저장
        await redis.set(`product:${productId}`, JSON.stringify(product));
        
        console.log(`📷 이미지 순서 변경: ${productId}, ${images.length}개`);
        
        res.json({ 
            status: 'success', 
            message: '이미지 순서가 변경되었습니다',
            images: images 
        });
        
    } catch (error) {
        console.error('이미지 순서 변경 에러:', error);
        res.status(500).json({ error: '이미지 순서 변경 실패' });
    }
});

// 상품 삭제 (이미지 포함)
app.delete('/api/products/extracted/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        
        // 이미지 디렉토리 삭제
        const productDir = path.join(STORAGE_DIR, productId);
        if (fs.existsSync(productDir)) {
            fs.rmSync(productDir, { recursive: true, force: true });
            console.log(`🗑️ 이미지 폴더 삭제: ${productDir}`);
        }
        
        // Redis에서 삭제
        await redis.del(`product:${productId}`);
        await redis.srem('products:list', productId);
        
        res.json({ status: 'success', message: '상품이 삭제되었습니다' });
        
    } catch (error) {
        console.error('상품 삭제 에러:', error);
        res.status(500).json({ error: '상품 삭제 실패' });
    }
});

// 상세 이미지 수정
app.put('/api/products/extracted/:productId/detail-images', async (req, res) => {
    try {
        const { productId } = req.params;
        const { detail_images } = req.body;
        
        if (!detail_images || !Array.isArray(detail_images)) {
            return res.status(400).json({ error: '상세 이미지 배열이 필요합니다' });
        }
        
        // Redis에서 상품 정보 가져오기
        const data = await redis.get(`product:${productId}`);
        if (!data) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }
        
        const product = JSON.parse(data);
        
        // 상세 이미지 업데이트
        product.detail_images = detail_images;
        
        // Redis에 저장
        await redis.set(`product:${productId}`, JSON.stringify(product));
        
        console.log(`🖼️ 상세 이미지 변경: ${productId}, ${detail_images.length}개`);
        
        res.json({ 
            status: 'success', 
            message: '상세 이미지가 변경되었습니다',
            detail_images: detail_images 
        });
        
    } catch (error) {
        console.error('상세 이미지 변경 에러:', error);
        res.status(500).json({ error: '상세 이미지 변경 실패' });
    }
});

// 옵션 수정
app.put('/api/products/extracted/:productId/options', async (req, res) => {
    try {
        const { productId } = req.params;
        const { options } = req.body;
        
        if (!options || !Array.isArray(options)) {
            return res.status(400).json({ error: '옵션 배열이 필요합니다' });
        }
        
        // Redis에서 상품 정보 가져오기
        const data = await redis.get(`product:${productId}`);
        if (!data) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }
        
        const product = JSON.parse(data);
        
        // 옵션 업데이트
        product.options = options;
        
        // Redis에 저장
        await redis.set(`product:${productId}`, JSON.stringify(product));
        
        console.log(`⚙️ 옵션 변경: ${productId}, ${options.length}개 그룹`);
        
        res.json({ 
            status: 'success', 
            message: '옵션이 변경되었습니다',
            options: options 
        });
        
    } catch (error) {
        console.error('옵션 변경 에러:', error);
        res.status(500).json({ error: '옵션 변경 실패' });
    }
});

// 상품명 수정
app.put('/api/products/extracted/:productId/title', async (req, res) => {
    try {
        const { productId } = req.params;
        const { title, title_kr } = req.body;
        
        if (!title) {
            return res.status(400).json({ error: '상품명이 필요합니다' });
        }
        
        // Redis에서 상품 정보 가져오기
        const data = await redis.get(`product:${productId}`);
        if (!data) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }
        
        const product = JSON.parse(data);
        
        // 상품명 업데이트
        product.title = title;
        product.title_kr = title_kr || null;
        
        // Redis에 저장
        await redis.set(`product:${productId}`, JSON.stringify(product));
        
        console.log(`📝 상품명 변경: ${productId}`);
        
        res.json({ 
            status: 'success', 
            message: '상품명이 변경되었습니다',
            title: title,
            title_kr: title_kr
        });
        
    } catch (error) {
        console.error('상품명 변경 에러:', error);
        res.status(500).json({ error: '상품명 변경 실패' });
    }
});

// =====================================================
// Google Cloud Translation API
// =====================================================

// 중->한 사전 (fallback용)
const translationDict: { [key: string]: string } = {
    // 옵션 관련
    '颜色分类': '색상', '颜色': '색상', '尺码': '사이즈', '尺寸': '사이즈',
    '规格': '규격', '型号': '모델', '款式': '스타일', '版本': '버전',
    '随机': '랜덤', '不挑款': '랜덤발송', '挑款': '지정가능',
    '全款': '전체', '整套': '풀세트', '单个': '단품',
    '盒': '박스', '套': '세트', '个': '개', '件': '개', '只': '개',
    '大号': '대형', '中号': '중형', '小号': '소형', '包': '팩',
    // 브랜드/시리즈
    '乐高': '레고', '幻影忍者': '닌자고', '积木': '블록', '拼装': '조립',
    '玩具': '장난감', '儿童': '아동', '孩子': '아이', '礼物': '선물',
    // 색상
    '黑色': '블랙', '白色': '화이트', '红色': '레드', '蓝色': '블루',
    '绿色': '그린', '黄色': '옐로우', '粉色': '핑크', '紫色': '퍼플',
    '灰色': '그레이', '棕色': '브라운', '金色': '골드', '银色': '실버',
    // 기타
    '创意': '크리에이티브', '卡通': '캐릭터', '可爱': '귀여운', '仿真': '리얼',
    '造型': '모양', '趣味': '재미있는', '面包': '빵', '吐司': '토스트',
    '橡皮擦': '지우개', '橡皮': '지우개', '食物': '음식',
    '德国': '독일', '日本': '일본', '韩国': '한국', '中国': '중국',
    '益智': '교육용', '闯关': '도전', '冒险': '어드벤처',
    '颗粒': '입자', '弹珠': '구슬', '滑道': '슬라이드', '轨道': '트랙',
    '滚珠': '구슬', '大冒险': '대모험', '探索': '탐험', '旋风': '회오리',
    '摩天轮': '관람차', '阶梯': '계단', '火箭': '로켓',
    '两袋': '2팩', '三袋': '3팩', '四袋': '4팩', '五袋': '5팩',
    '搞怪': '재미있는'
};

// 사전 기반 번역 (fallback)
function translateWithDict(text: string): string {
    if (!text) return '';
    let result = text;
    
    // 긴 단어부터 매칭
    const sortedKeys = Object.keys(translationDict).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        result = result.replace(new RegExp(key, 'g'), translationDict[key]);
    }
    
    return result;
}

// Google Cloud Translation으로 번역
async function translateWithGoogle(texts: string[]): Promise<string[]> {
    if (!translationClient || !GOOGLE_PROJECT_ID) {
        return texts.map(t => translateWithDict(t));
    }
    
    try {
        const parent = `projects/${GOOGLE_PROJECT_ID}/locations/${GOOGLE_LOCATION}`;
        
        // Glossary 사용 시도
        let glossaryConfig = undefined;
        try {
            const glossaryPath = `${parent}/glossaries/${GLOSSARY_ID}`;
            glossaryConfig = { glossary: glossaryPath };
        } catch (e) {
            // Glossary 없으면 무시
        }
        
        const request: any = {
            parent,
            contents: texts,
            mimeType: 'text/plain',
            sourceLanguageCode: 'zh-CN',
            targetLanguageCode: 'ko',
        };
        
        if (glossaryConfig) {
            request.glossaryConfig = glossaryConfig;
        }
        
        const [response] = await translationClient.translateText(request);
        
        return response.translations?.map((t: any) => 
            t.glossaryTranslations?.[0]?.translatedText || t.translatedText || ''
        ) || texts.map(t => translateWithDict(t));
        
    } catch (error: any) {
        console.log('Google 번역 실패, 사전 사용:', error.message);
        return texts.map(t => translateWithDict(t));
    }
}

// 번역 API 엔드포인트
app.post('/api/translate', async (req, res) => {
    try {
        const { texts } = req.body;
        
        if (!texts || !Array.isArray(texts)) {
            return res.status(400).json({ error: 'texts 배열이 필요합니다' });
        }
        
        // 캐시 확인
        const cacheKey = `translate:${texts.join('|||')}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            return res.json({ translations: JSON.parse(cached), cached: true });
        }
        
        // 번역 수행
        const translations = await translateWithGoogle(texts);
        
        // 캐시 저장 (24시간)
        await redis.set(cacheKey, JSON.stringify(translations), 'EX', 86400);
        
        res.json({ translations, cached: false });
        
    } catch (error: any) {
        console.error('번역 오류:', error);
        res.status(500).json({ error: '번역 실패', message: error.message });
    }
});

// 단일 텍스트 번역
app.get('/api/translate/:text', async (req, res) => {
    try {
        const text = decodeURIComponent(req.params.text);
        
        // 캐시 확인
        const cacheKey = `translate:single:${text}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            return res.json({ translation: cached, cached: true });
        }
        
        const [translation] = await translateWithGoogle([text]);
        
        // 캐시 저장
        await redis.set(cacheKey, translation, 'EX', 86400);
        
        res.json({ translation, cached: false });
        
    } catch (error: any) {
        console.error('번역 오류:', error);
        res.status(500).json({ error: '번역 실패' });
    }
});

// Glossary 생성 API (관리용)
app.post('/api/glossary/create', async (req, res) => {
    if (!translationClient || !GOOGLE_PROJECT_ID) {
        return res.status(400).json({ error: 'Google Cloud 미설정' });
    }
    
    try {
        const parent = `projects/${GOOGLE_PROJECT_ID}/locations/${GOOGLE_LOCATION}`;
        const glossaryId = GLOSSARY_ID;
        
        // Glossary 용어 (확장 가능)
        const glossaryTerms = [
            ['乐高', '레고'],
            ['幻影忍者', '닌자고'],
            ['积木', '블록'],
            ['颜色分类', '색상'],
            ['尺码', '사이즈'],
            ['橡皮擦', '지우개'],
            ['吐司', '토스트'],
            ['面包', '빵'],
            ['玩具', '장난감'],
            ['益智', '교육용'],
            ['滚珠', '구슬'],
            ['轨道', '트랙'],
        ];
        
        // CSV 형식으로 변환
        const csvContent = glossaryTerms.map(([zh, ko]) => `${zh},${ko}`).join('\n');
        const inputUri = `gs://${GOOGLE_PROJECT_ID}-glossary/${glossaryId}.csv`;
        
        // 실제 환경에서는 GCS에 파일 업로드 필요
        res.json({ 
            message: 'Glossary 생성은 GCS 설정이 필요합니다',
            terms: glossaryTerms.length,
            glossaryId 
        });
        
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// 네이버 스마트스토어 카테고리 API
// =====================================================

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
const NAVER_API_URL = 'https://api.commerce.naver.com/external/v1';

// 네이버 API 토큰 관리
interface NaverToken {
    access_token: string;
    token_type: string;
    expires_at: number;
}

let naverTokenCache: NaverToken | null = null;
let naverAuthStatus: { 
    authenticated: boolean; 
    message: string; 
    lastCheck: string;
    expiresAt?: string;
} = { 
    authenticated: false, 
    message: '인증 전', 
    lastCheck: new Date().toISOString() 
};

// 네이버 API 토큰 발급
async function getNaverAccessToken(): Promise<string> {
    // 캐시된 토큰이 유효한지 확인
    if (naverTokenCache && naverTokenCache.expires_at > Date.now()) {
        console.log('🔑 캐시된 네이버 토큰 사용');
        return naverTokenCache.access_token;
    }
    
    if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
        naverAuthStatus = {
            authenticated: false,
            message: 'NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되지 않았습니다',
            lastCheck: new Date().toISOString()
        };
        throw new Error('네이버 API 인증 정보가 설정되지 않았습니다');
    }
    
    try {
        console.log('🔑 네이버 API 토큰 발급 시도...');

        // timestamp (밀리초) - 3초 전 기준
        const timestamp = Date.now();

        // 전자서명 생성
        // client_id + "_" + timestamp 를 bcrypt로 해싱 후 Base64 인코딩
        const bcrypt = await import('bcrypt');
        const password = `${NAVER_CLIENT_ID}_${timestamp}`;

        // bcrypt로 패스워드를 client_secret으로 해싱
        const hashed = await bcrypt.hash(password, NAVER_CLIENT_SECRET);

        // Base64로 인코딩
        const clientSecretSign = Buffer.from(hashed).toString('base64');

        console.log(`🔑 서명 생성 완료 (timestamp: ${timestamp})`);
        
        const requestBody = new URLSearchParams({
            client_id: NAVER_CLIENT_ID,
            timestamp: timestamp.toString(),
            client_secret_sign: clientSecretSign,
            grant_type: 'client_credentials',
            type: 'SELF'
        });
        
        console.log('🔑 토큰 요청 중...');
        
        const response = await fetch('https://api.commerce.naver.com/external/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: requestBody
        });
        
        const responseText = await response.text();
        console.log(`🔑 토큰 응답: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            console.error('❌ 토큰 발급 실패:', responseText);
            naverAuthStatus = {
                authenticated: false,
                message: `토큰 발급 실패 (${response.status}): ${responseText}`,
                lastCheck: new Date().toISOString()
            };
            throw new Error(`토큰 발급 실패: ${responseText}`);
        }
        
        const data = JSON.parse(responseText);
        
        // 토큰 캐시 (만료 1분 전까지 유효)
        const expiresAt = Date.now() + (data.expires_in - 60) * 1000;
        naverTokenCache = {
            access_token: data.access_token,
            token_type: data.token_type || 'Bearer',
            expires_at: expiresAt
        };
        
        naverAuthStatus = {
            authenticated: true,
            message: '인증 성공',
            lastCheck: new Date().toISOString(),
            expiresAt: new Date(expiresAt).toISOString()
        };
        
        console.log('✅ 네이버 API 토큰 발급 완료!');
        console.log(`   - 토큰 타입: ${data.token_type}`);
        console.log(`   - 유효 시간: ${data.expires_in}초`);
        console.log(`   - 만료 시각: ${new Date(expiresAt).toLocaleString('ko-KR')}`);
        
        return data.access_token;
        
    } catch (error: any) {
        console.error('❌ 네이버 토큰 발급 오류:', error.message);
        naverAuthStatus = {
            authenticated: false,
            message: error.message,
            lastCheck: new Date().toISOString()
        };
        throw error;
    }
}

// 네이버 배송지 조회 API
app.get('/api/naver/addresses', async (req, res) => {
    console.log('📦 네이버 배송지 조회');

    try {
        const accessToken = await getNaverAccessToken();
        console.log('🔑 사용할 토큰:', accessToken.substring(0, 20) + '...');

        // 올바른 엔드포인트: /external/v1/seller/addressbooks-for-page
        const response = await fetch('https://api.commerce.naver.com/external/v1/seller/addressbooks-for-page?page=1', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        console.log('📡 응답 상태:', response.status);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ API 에러 응답:', errorData);
            throw new Error(`배송지 조회 실패: ${JSON.stringify(errorData)}`);
        }

        const data: any = await response.json();
        console.log('📦 받은 원본 데이터:', JSON.stringify(data).substring(0, 300));

        // API 응답 구조: { addressBooks: [...] }
        const addressList = data.addressBooks || [];
        console.log(`✅ 배송지 ${addressList.length}개 조회 완료`);

        res.json({
            addresses: addressList.map((addr: any) => ({
                id: addr.addressBookNo,
                name: addr.name,
                type: addr.addressType,
                baseAddress: addr.baseAddress,
                detailAddress: addr.detailAddress,
                zipCode: addr.postalCode,
                tel1: addr.phoneNumber1,
                tel2: addr.phoneNumber2
            }))
        });
    } catch (error: any) {
        console.error('❌ 배송지 조회 오류:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 네이버 이미지 업로드 함수
async function uploadImageToNaver(imageUrl: string, accessToken: string): Promise<string> {
    try {
        console.log(`📤 이미지 업로드 중: ${imageUrl.substring(0, 50)}...`);

        // 이미지 다운로드
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        let imageBuffer = Buffer.from(imageResponse.data);

        // Content-Type에서 이미지 포맷 확인
        const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
        let extension = 'jpg';
        let mimeType = 'image/jpeg';

        // 네이버가 지원하는 포맷: JPEG, JPG, GIF, PNG, BMP
        // WebP나 기타 포맷은 JPEG로 변환
        if (contentType.includes('webp')) {
            console.log('   🔄 WebP 이미지를 JPEG로 변환 중...');
            imageBuffer = await sharp(imageBuffer)
                .jpeg({ quality: 90 })
                .toBuffer();
            extension = 'jpg';
            mimeType = 'image/jpeg';
        } else if (contentType.includes('png')) {
            extension = 'png';
            mimeType = 'image/png';
        } else if (contentType.includes('gif')) {
            extension = 'gif';
            mimeType = 'image/gif';
        } else if (contentType.includes('bmp')) {
            extension = 'bmp';
            mimeType = 'image/bmp';
        } else {
            // 기본적으로 JPEG로 처리
            extension = 'jpg';
            mimeType = 'image/jpeg';
        }

        // FormData 생성
        const formData = new FormData();
        formData.append('imageFiles', imageBuffer, {
            filename: `product-image.${extension}`,
            contentType: mimeType
        });

        // 네이버 이미지 업로드 API 호출
        const uploadResponse = await axios.post(
            'https://api.commerce.naver.com/external/v1/product-images/upload',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (uploadResponse.data && uploadResponse.data.images && uploadResponse.data.images.length > 0) {
            const uploadedUrl = uploadResponse.data.images[0].url;
            console.log(`✅ 이미지 업로드 성공: ${uploadedUrl}`);
            return uploadedUrl;
        }

        throw new Error('이미지 업로드 실패: 응답에 URL이 없습니다');
    } catch (error: any) {
        console.error(`❌ 이미지 업로드 오류:`, error.response?.data || error.message);
        throw error;
    }
}

// 네이버 스마트스토어 상품 등록 API
app.post('/api/naver/products/register', async (req, res) => {
    console.log('📦 네이버 스마트스토어 상품 등록');

    try {
        const { productId } = req.body;

        // Redis에서 상품 정보 조회
        const productData = await redis.get(`product:${productId}`);
        if (!productData) {
            throw new Error('상품 정보를 찾을 수 없습니다');
        }

        const product = JSON.parse(productData);
        console.log('📦 등록할 상품:', product.title);

        // 환경설정 조회
        const settingsData = await redis.get('app:settings');
        const settings = settingsData ? JSON.parse(settingsData) : {};

        // 필수 설정 확인
        if (!settings.outbound_location_id || !settings.return_address_id) {
            throw new Error('출고지 및 반품 수거지 설정이 필요합니다');
        }

        // 네이버 액세스 토큰 발급
        const accessToken = await getNaverAccessToken();

        // 이미지 데이터 준비 (원본 타오바오 이미지 URL 사용)
        // 옵션에서 원본 이미지 URL 추출
        const originalImageUrls: string[] = [];
        if (product.options && product.options.length > 0) {
            for (const option of product.options) {
                if (option.values && Array.isArray(option.values)) {
                    for (const value of option.values) {
                        if (value.image && value.image.startsWith('http')) {
                            originalImageUrls.push(value.image);
                        }
                    }
                }
            }
        }

        // 원본 이미지가 없으면 로컬 이미지를 공개 URL로 변환
        const baseUrl = process.env.BASE_URL || 'http://localhost';
        const toPublicUrl = (url: string) => {
            if (url.startsWith('http://') || url.startsWith('https://')) {
                return url;
            }
            return `${baseUrl}${url.startsWith('/') ? url : '/' + url}`;
        };

        let imageUrls: string[] = originalImageUrls;
        if (imageUrls.length === 0 && product.images && product.images.length > 0) {
            // 로컬 이미지를 공개 URL로 변환
            imageUrls = product.images.map((img: string) => toPublicUrl(img));
        }

        // 이미지를 네이버에 업로드
        console.log(`📤 ${imageUrls.length}개의 이미지를 네이버에 업로드 중...`);
        const uploadedImageUrls: string[] = [];

        for (let i = 0; i < Math.min(imageUrls.length, 10); i++) {
            try {
                const uploadedUrl = await uploadImageToNaver(imageUrls[i], accessToken);
                uploadedImageUrls.push(uploadedUrl);
            } catch (error: any) {
                console.error(`이미지 ${i + 1} 업로드 실패:`, error.message);
                // 첫 번째 이미지(대표 이미지) 업로드 실패시 전체 실패
                if (i === 0) {
                    throw new Error(`대표 이미지 업로드 실패: ${error.message}`);
                }
                // 선택 이미지는 실패해도 계속 진행
            }
        }

        console.log(`✅ ${uploadedImageUrls.length}개의 이미지 업로드 완료`);

        const representativeImage = uploadedImageUrls.length > 0
            ? { url: uploadedImageUrls[0] }
            : null;
        const optionalImages = uploadedImageUrls.length > 1
            ? uploadedImageUrls.slice(1).map((img: string) => ({ url: img }))
            : [];

        // 옵션 데이터 변환
        const optionCombinations = product.options?.length > 0
            ? product.options.flatMap((opt: any, optIdx: number) =>
                opt.values.map((val: any, valIdx: number) => ({
                    id: `${optIdx}-${valIdx}`,
                    optionName1: `옵션${optIdx + 1}`,
                    optionValue1: val.name_kr || val.name || val,
                    stockQuantity: val.quantity || 999,
                    price: val.price_krw ? Math.round(val.price_krw) : (product.selling_price || Math.round(product.price * (settings.exchange_rate || 209))),
                    sellerManagerCode: `OPT${optIdx}${valIdx}`
                }))
              )
            : null;

        // 카테고리 ID 확인 (필수 필드)
        const categoryId = product.naver_category_id || settings.default_category_id || '50000169';

        // 상품 데이터 변환
        const naverProduct = {
            originProduct: {
                statusType: 'SALE',  // 판매중
                saleType: 'NEW',     // 신상품
                leafCategoryId: categoryId,  // 카테고리 ID
                name: product.title_kr || product.title,  // 한국어 제목 우선 사용
                images: {
                    representativeImage: representativeImage,
                    optionalImages: optionalImages
                },
                salePrice: product.selling_price || Math.round(product.price * (settings.exchange_rate || 209)),
                stockQuantity: 999,  // 재고수량은 항상 입력
                optionInfo: optionCombinations ? {
                    optionCombinations: optionCombinations,
                    useStockManagement: true,
                    optionDeliveryAttributes: []
                } : null,
                deliveryInfo: {
                    deliveryType: 'DELIVERY',
                    deliveryAttributeType: 'NORMAL',
                    deliveryCompany: settings.default_delivery_company || 'CJGLS',
                    deliveryBundleGroupUsable: false,
                    visitAddressId: parseInt(settings.outbound_location_id),
                    returnCenterCode: settings.return_address_id,
                    deliveryFee: {
                        deliveryFeeType: 'FREE'
                    },
                    claimDeliveryInfo: {
                        returnDeliveryCompanyPriorityType: 'PRIMARY',
                        returnDeliveryFee: 3000,
                        exchangeDeliveryFee: 6000,
                        shippingAddressId: settings.shipping_address_id ? parseInt(settings.shipping_address_id) : parseInt(settings.outbound_location_id),
                        returnAddressId: parseInt(settings.return_address_id)
                    }
                },
                detailContent: product.description || '상품 상세 설명',
                detailAttribute: {
                    naverShoppingSearchInfo: {
                        manufacturerName: '해외구매대행',
                        brandName: '해외구매대행',
                        modelName: product.product_id || ''
                    },
                    afterServiceInfo: {
                        afterServiceTelephoneNumber: settings.as_phone || '1588-0000',
                        afterServiceGuideContent: settings.as_guide || '상품 수령 후 7일 이내 교환/반품 가능합니다.'
                    },
                    minorPurchasable: true,
                    originAreaInfo: {
                        originAreaCode: '0200037',  // 수입산:아시아>중국
                        importer: settings.importer_name || '해외구매대행',
                        plural: false
                    },
                    productInfoProvidedNotice: {
                        productInfoProvidedNoticeType: 'ETC',
                        etc: {
                            itemName: product.title_kr || product.title,
                            modelName: product.product_id || '상품 페이지 참조',
                            returnCostReason: '상품 페이지 참조',
                            noRefundReason: '상품 페이지 참조',
                            qualityAssuranceStandard: '상품 페이지 참조',
                            compensationProcedure: '상품 페이지 참조',
                            troubleShootingContents: '상품 페이지 참조',
                            afterServiceDirector: settings.importer_name || '해외구매대행',
                            manufacturer: '해외구매대행',
                            countryOfManufacture: '중국'
                        }
                    },
                    certificationTargetExcludeContent: {
                        kcCertifiedProductExclusionYn: 'KC_EXEMPTION_OBJECT',
                        kcExemptionType: 'OVERSEAS'
                    },
                    productCertificationInfos: [
                        {
                            certificationKindType: 'KC_PRODUCT_SAFETY',
                            certificationInfos: [
                                {
                                    name: '해외구매대행',
                                    certificationNumber: '해외구매대행',
                                    certificationMark: {
                                        usable: false
                                    }
                                }
                            ]
                        }
                    ]
                }
            },
            smartstoreChannelProduct: {
                storeKeepExclusiveProduct: false,
                naverShoppingRegistration: true,
                channelProductDisplayStatusType: 'SUSPENSION'  // API 문서: WAIT, ON, SUSPENSION
            }
        };

        // 네이버 상품 등록 API 호출
        const requestBody = JSON.stringify(naverProduct);
        console.log('📤 전송할 데이터 (전체):', JSON.stringify(naverProduct, null, 2));

        const response = await fetch('https://api.commerce.naver.com/external/v2/products', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: requestBody
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ 상품 등록 실패:', errorData);
            throw new Error(`상품 등록 실패: ${JSON.stringify(errorData)}`);
        }

        const result: any = await response.json();
        console.log('✅ 상품 등록 성공:', result);

        res.json({
            success: true,
            productNo: result.productNo,
            message: '상품이 네이버 스마트스토어에 등록되었습니다'
        });

    } catch (error: any) {
        console.error('❌ 상품 등록 오류:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 네이버 API 인증 상태 확인 API
app.get('/api/naver/auth/status', async (req, res) => {
    console.log('🔑 네이버 인증 상태 확인');

    // 설정 여부
    const hasCredentials = !!(NAVER_CLIENT_ID && NAVER_CLIENT_SECRET);

    // 토큰 유효성 확인
    const tokenValid = naverTokenCache && naverTokenCache.expires_at > Date.now();

    res.json({
        configured: hasCredentials,
        authenticated: tokenValid,
        status: naverAuthStatus,
        clientIdSet: !!NAVER_CLIENT_ID,
        clientSecretSet: !!NAVER_CLIENT_SECRET,
        tokenExpired: naverTokenCache ? naverTokenCache.expires_at < Date.now() : true
    });
});

// 네이버 API 인증 테스트/갱신 API
app.post('/api/naver/auth/token', async (req, res) => {
    console.log('🔑 네이버 토큰 발급 요청');
    
    if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
        return res.status(400).json({
            success: false,
            error: '네이버 API 인증 정보가 설정되지 않았습니다',
            hint: 'NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 환경변수를 설정해주세요'
        });
    }
    
    try {
        // 기존 캐시 삭제하고 새로 발급
        naverTokenCache = null;
        await getNaverAccessToken();

        res.json({
            success: true,
            message: '토큰 발급 성공',
            tokenType: (naverTokenCache as unknown as NaverToken).token_type,
            expiresAt: new Date((naverTokenCache as unknown as NaverToken).expires_at).toISOString()
        });
        
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 카테고리 데이터 타입
interface NaverCategory {
    id: string;
    name: string;
    wholeCategoryName: string;
    parentCategoryId?: string;
    level: number;
    children?: NaverCategory[];
}

// 네이버 카테고리 전체 조회
async function fetchNaverCategories(): Promise<any[]> {
    const token = await getNaverAccessToken();
    
    const response = await fetch(`${NAVER_API_URL}/categories`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json;charset=UTF-8',
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`카테고리 조회 실패: ${error}`);
    }
    
    const data = await response.json();
    return data as any[];
}

// 카테고리 계층 구조로 변환
function buildCategoryTree(categories: any[]): NaverCategory[] {
    const categoryMap = new Map<string, NaverCategory>();
    const rootCategories: NaverCategory[] = [];

    // wholeCategoryName으로 부모 카테고리 ID를 찾는 헬퍼 함수
    const findParentId = (wholeCategoryName: string): string | undefined => {
        const parts = wholeCategoryName.split('>');
        if (parts.length <= 1) return undefined; // 루트 카테고리

        // 부모의 wholeCategoryName (마지막 부분 제거)
        const parentWholeName = parts.slice(0, -1).join('>');

        // 부모 카테고리 찾기
        for (const cat of categories) {
            if (cat.wholeCategoryName === parentWholeName) {
                return cat.id;
            }
        }
        return undefined;
    };

    // 먼저 모든 카테고리를 맵에 저장하고 부모 ID 설정
    categories.forEach(cat => {
        const parentId = findParentId(cat.wholeCategoryName);
        categoryMap.set(cat.id, {
            id: cat.id,
            name: cat.name,
            wholeCategoryName: cat.wholeCategoryName,
            parentCategoryId: parentId,
            level: (cat.wholeCategoryName?.split('>').length || 1),
            children: []
        });
    });

    // 부모-자식 관계 설정
    categoryMap.forEach((category) => {
        if (category.parentCategoryId && categoryMap.has(category.parentCategoryId)) {
            const parent = categoryMap.get(category.parentCategoryId);
            parent?.children?.push(category);
        } else {
            rootCategories.push(category);
        }
    });

    return rootCategories;
}

// 카테고리 조회 API
app.get('/api/naver/categories', async (req, res) => {
    console.log('📂 카테고리 조회 요청');
    
    try {
        // Redis 캐시 확인
        const cached = await redis.get('naver:categories');
        if (cached) {
            console.log('📂 캐시된 카테고리 반환');
            const data = JSON.parse(cached);
            return res.json({
                categories: data.categories,
                tree: data.tree,
                updatedAt: data.updatedAt,
                cached: true
            });
        }
        
        // API 인증 정보 확인
        if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
            console.log('⚠️ 네이버 API 미설정 - 샘플 카테고리 반환');
            // 샘플 카테고리 제공 (테스트용)
            const sampleCategories = getSampleCategories();
            const tree = buildCategoryTree(sampleCategories);
            
            // Redis에 캐시 (1시간 - 샘플이므로 짧게)
            await redis.set('naver:categories', JSON.stringify({
                categories: sampleCategories,
                tree,
                updatedAt: new Date().toISOString(),
                isSample: true
            }), 'EX', 3600);
            
            return res.json({
                categories: sampleCategories,
                tree,
                updatedAt: new Date().toISOString(),
                cached: false,
                isSample: true,
                message: '샘플 카테고리입니다. 실제 카테고리를 사용하려면 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 설정하세요.'
            });
        }
        
        // 캐시 없으면 API 호출
        console.log('📂 네이버 API에서 카테고리 조회 중...');
        const categories = await fetchNaverCategories();
        const tree = buildCategoryTree(categories);
        const updatedAt = new Date().toISOString();
        
        // Redis에 캐시 (24시간)
        await redis.set('naver:categories', JSON.stringify({
            categories,
            tree,
            updatedAt
        }), 'EX', 86400);
        
        console.log(`✅ 네이버 카테고리 ${categories.length}개 저장됨`);
        
        res.json({
            categories,
            tree,
            updatedAt,
            cached: false
        });
        
    } catch (error: any) {
        console.error('❌ 카테고리 조회 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 샘플 카테고리 데이터 (네이버 API 미설정 시 사용)
function getSampleCategories() {
    return [
        // 대분류
        { id: '50000000', name: '완구/취미', wholeCategoryName: '완구/취미', parentCategoryId: null },
        { id: '50000001', name: '패션의류', wholeCategoryName: '패션의류', parentCategoryId: null },
        { id: '50000002', name: '패션잡화', wholeCategoryName: '패션잡화', parentCategoryId: null },
        { id: '50000003', name: '화장품/미용', wholeCategoryName: '화장품/미용', parentCategoryId: null },
        { id: '50000004', name: '디지털/가전', wholeCategoryName: '디지털/가전', parentCategoryId: null },
        { id: '50000005', name: '가구/인테리어', wholeCategoryName: '가구/인테리어', parentCategoryId: null },
        { id: '50000006', name: '출산/육아', wholeCategoryName: '출산/육아', parentCategoryId: null },
        { id: '50000007', name: '식품', wholeCategoryName: '식품', parentCategoryId: null },
        { id: '50000008', name: '스포츠/레저', wholeCategoryName: '스포츠/레저', parentCategoryId: null },
        { id: '50000009', name: '생활/건강', wholeCategoryName: '생활/건강', parentCategoryId: null },
        
        // 완구/취미 중분류
        { id: '50001000', name: '블록/조립완구', wholeCategoryName: '완구/취미 > 블록/조립완구', parentCategoryId: '50000000' },
        { id: '50001001', name: '인형/피규어', wholeCategoryName: '완구/취미 > 인형/피규어', parentCategoryId: '50000000' },
        { id: '50001002', name: '로봇/RC완구', wholeCategoryName: '완구/취미 > 로봇/RC완구', parentCategoryId: '50000000' },
        { id: '50001003', name: '보드게임/퍼즐', wholeCategoryName: '완구/취미 > 보드게임/퍼즐', parentCategoryId: '50000000' },
        { id: '50001004', name: '교육완구', wholeCategoryName: '완구/취미 > 교육완구', parentCategoryId: '50000000' },
        
        // 블록/조립완구 소분류
        { id: '50002000', name: '블록세트', wholeCategoryName: '완구/취미 > 블록/조립완구 > 블록세트', parentCategoryId: '50001000' },
        { id: '50002001', name: '레고', wholeCategoryName: '완구/취미 > 블록/조립완구 > 레고', parentCategoryId: '50001000' },
        { id: '50002002', name: '호환블록', wholeCategoryName: '완구/취미 > 블록/조립완구 > 호환블록', parentCategoryId: '50001000' },
        { id: '50002003', name: '나노블록', wholeCategoryName: '완구/취미 > 블록/조립완구 > 나노블록', parentCategoryId: '50001000' },
        { id: '50002004', name: '기타블록', wholeCategoryName: '완구/취미 > 블록/조립완구 > 기타블록', parentCategoryId: '50001000' },
        
        // 인형/피규어 소분류
        { id: '50002010', name: '캐릭터인형', wholeCategoryName: '완구/취미 > 인형/피규어 > 캐릭터인형', parentCategoryId: '50001001' },
        { id: '50002011', name: '피규어', wholeCategoryName: '완구/취미 > 인형/피규어 > 피규어', parentCategoryId: '50001001' },
        { id: '50002012', name: '봉제인형', wholeCategoryName: '완구/취미 > 인형/피규어 > 봉제인형', parentCategoryId: '50001001' },
        
        // 패션의류 중분류
        { id: '50003000', name: '여성의류', wholeCategoryName: '패션의류 > 여성의류', parentCategoryId: '50000001' },
        { id: '50003001', name: '남성의류', wholeCategoryName: '패션의류 > 남성의류', parentCategoryId: '50000001' },
        { id: '50003002', name: '아동의류', wholeCategoryName: '패션의류 > 아동의류', parentCategoryId: '50000001' },
        
        // 여성의류 소분류
        { id: '50004000', name: '티셔츠', wholeCategoryName: '패션의류 > 여성의류 > 티셔츠', parentCategoryId: '50003000' },
        { id: '50004001', name: '원피스', wholeCategoryName: '패션의류 > 여성의류 > 원피스', parentCategoryId: '50003000' },
        { id: '50004002', name: '바지', wholeCategoryName: '패션의류 > 여성의류 > 바지', parentCategoryId: '50003000' },
        
        // 패션잡화 중분류
        { id: '50005000', name: '가방', wholeCategoryName: '패션잡화 > 가방', parentCategoryId: '50000002' },
        { id: '50005001', name: '신발', wholeCategoryName: '패션잡화 > 신발', parentCategoryId: '50000002' },
        { id: '50005002', name: '시계', wholeCategoryName: '패션잡화 > 시계', parentCategoryId: '50000002' },
        
        // 가방 소분류
        { id: '50006000', name: '백팩', wholeCategoryName: '패션잡화 > 가방 > 백팩', parentCategoryId: '50005000' },
        { id: '50006001', name: '크로스백', wholeCategoryName: '패션잡화 > 가방 > 크로스백', parentCategoryId: '50005000' },
        { id: '50006002', name: '토트백', wholeCategoryName: '패션잡화 > 가방 > 토트백', parentCategoryId: '50005000' },
        
        // 디지털/가전 중분류
        { id: '50007000', name: '휴대폰액세서리', wholeCategoryName: '디지털/가전 > 휴대폰액세서리', parentCategoryId: '50000004' },
        { id: '50007001', name: '이어폰/헤드폰', wholeCategoryName: '디지털/가전 > 이어폰/헤드폰', parentCategoryId: '50000004' },
        { id: '50007002', name: '컴퓨터주변기기', wholeCategoryName: '디지털/가전 > 컴퓨터주변기기', parentCategoryId: '50000004' },
        
        // 휴대폰액세서리 소분류
        { id: '50008000', name: '케이스', wholeCategoryName: '디지털/가전 > 휴대폰액세서리 > 케이스', parentCategoryId: '50007000' },
        { id: '50008001', name: '충전기/케이블', wholeCategoryName: '디지털/가전 > 휴대폰액세서리 > 충전기/케이블', parentCategoryId: '50007000' },
        { id: '50008002', name: '보호필름', wholeCategoryName: '디지털/가전 > 휴대폰액세서리 > 보호필름', parentCategoryId: '50007000' },
    ];
}

// 카테고리 강제 새로고침
app.post('/api/naver/categories/refresh', async (req, res) => {
    try {
        if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
            return res.status(400).json({
                error: '네이버 API 인증 정보가 설정되지 않았습니다'
            });
        }
        
        // 캐시 삭제
        await redis.del('naver:categories');
        
        // 새로 조회
        const categories = await fetchNaverCategories();
        const tree = buildCategoryTree(categories);
        const updatedAt = new Date().toISOString();
        
        // Redis에 캐시 (24시간)
        await redis.set('naver:categories', JSON.stringify({
            categories,
            tree,
            updatedAt
        }), 'EX', 86400);
        
        console.log(`✅ 네이버 카테고리 갱신: ${categories.length}개`);
        
        res.json({
            message: '카테고리가 갱신되었습니다',
            count: categories.length,
            updatedAt
        });
        
    } catch (error: any) {
        console.error('카테고리 갱신 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 대분류 카테고리 조회
app.get('/api/naver/categories/main', async (req, res) => {
    console.log('📂 대분류 카테고리 조회');
    
    try {
        let cached = await redis.get('naver:categories');
        
        // 캐시 없으면 샘플 데이터 로드
        if (!cached) {
            console.log('📂 카테고리 캐시 없음 - 샘플 데이터 로드');
            const sampleCategories = getSampleCategories();
            const tree = buildCategoryTree(sampleCategories);
            cached = JSON.stringify({
                categories: sampleCategories,
                tree,
                updatedAt: new Date().toISOString()
            });
            await redis.set('naver:categories', cached, 'EX', 3600);
        }
        
        const { tree } = JSON.parse(cached);
        
        // 대분류만 반환 (children 제외)
        const mainCategories = tree.map((cat: NaverCategory) => ({
            id: cat.id,
            name: cat.name
        }));
        
        res.json({ categories: mainCategories });
        
    } catch (error: any) {
        console.error('❌ 대분류 조회 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 중분류 카테고리 조회 (대분류 ID 기준)
app.get('/api/naver/categories/:parentId/children', async (req, res) => {
    console.log('📂 하위 카테고리 조회:', req.params.parentId);
    
    try {
        const { parentId } = req.params;
        
        let cached = await redis.get('naver:categories');
        
        // 캐시 없으면 샘플 데이터 로드
        if (!cached) {
            console.log('📂 카테고리 캐시 없음 - 샘플 데이터 로드');
            const sampleCategories = getSampleCategories();
            const tree = buildCategoryTree(sampleCategories);
            cached = JSON.stringify({
                categories: sampleCategories,
                tree,
                updatedAt: new Date().toISOString()
            });
            await redis.set('naver:categories', cached, 'EX', 3600);
        }
        
        const { categories } = JSON.parse(cached);
        
        // 해당 부모의 자식 카테고리 필터링
        const children = categories
            .filter((cat: any) => cat.parentCategoryId === parentId)
            .map((cat: any) => ({
                id: cat.id,
                name: cat.name,
                wholeCategoryName: cat.wholeCategoryName,
                hasChildren: categories.some((c: any) => c.parentCategoryId === cat.id)
            }));
        
        res.json({ categories: children });
        
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 카테고리 검색
app.get('/api/naver/categories/search', async (req, res) => {
    console.log('📂 카테고리 검색 요청:', req.query.q);
    
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string') {
            return res.status(400).json({ error: '검색어(q)를 입력해주세요', categories: [] });
        }
        
        let cached = await redis.get('naver:categories');
        
        // 캐시 없으면 샘플 데이터 로드
        if (!cached) {
            console.log('📂 카테고리 캐시 없음 - 샘플 데이터 로드');
            const sampleCategories = getSampleCategories();
            const tree = buildCategoryTree(sampleCategories);
            cached = JSON.stringify({
                categories: sampleCategories,
                tree,
                updatedAt: new Date().toISOString()
            });
            await redis.set('naver:categories', cached, 'EX', 3600);
        }
        
        const { categories } = JSON.parse(cached);
        
        // 이름 또는 전체 경로에서 검색
        const searchTerm = q.toLowerCase();
        const results = categories
            .filter((cat: any) => 
                cat.name?.toLowerCase().includes(searchTerm) ||
                cat.wholeCategoryName?.toLowerCase().includes(searchTerm)
            )
            .slice(0, 50)  // 최대 50개
            .map((cat: any) => ({
                id: cat.id,
                name: cat.name,
                wholeCategoryName: cat.wholeCategoryName
            }));
        
        console.log(`📂 검색 결과: ${results.length}개`);
        res.json({ categories: results, count: results.length });
        
    } catch (error: any) {
        console.error('❌ 카테고리 검색 오류:', error);
        res.status(500).json({ error: error.message, categories: [] });
    }
});

// 상품에 카테고리 지정
app.put('/api/products/extracted/:productId/category', async (req, res) => {
    try {
        const { productId } = req.params;
        const { categoryId, categoryName, wholeCategoryName } = req.body;
        
        const productKey = `product:${productId}`;
        const existing = await redis.get(productKey);
        
        if (!existing) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }
        
        const product = JSON.parse(existing);
        product.naver_category_id = categoryId;
        product.naver_category_name = categoryName;
        product.naver_category_path = wholeCategoryName;
        product.updated_at = new Date().toISOString();
        
        await redis.set(productKey, JSON.stringify(product));
        
        console.log(`📂 상품 카테고리 설정: ${productId} -> ${wholeCategoryName}`);
        
        res.json({ 
            message: '카테고리가 설정되었습니다',
            categoryId,
            categoryName,
            wholeCategoryName
        });
        
    } catch (error: any) {
        console.error('카테고리 설정 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 판매가 설정 (가격 배수 적용)
app.put('/api/products/extracted/:productId/selling-price', async (req, res) => {
    try {
        const { productId } = req.params;
        const { selling_price, price_multiplier, price_add_amount } = req.body;

        const productKey = `product:${productId}`;
        const existing = await redis.get(productKey);

        if (!existing) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }

        const product = JSON.parse(existing);
        product.selling_price = selling_price;
        product.price_multiplier = price_multiplier || 1;
        product.price_add_amount = price_add_amount || 0;
        product.updated_at = new Date().toISOString();

        // 옵션들의 가격도 배수와 추가금액 적용
        if (product.options && Array.isArray(product.options)) {
            product.options.forEach((option: any) => {
                if (option.values && Array.isArray(option.values)) {
                    option.values.forEach((value: any) => {
                        // 타오바오 원가(CNY)가 있고 환율이 있으면 KRW로 변환 후 배수/추가금액 적용
                        if (value.price && product.exchange_rate) {
                            const baseKrwPrice = Math.round(value.price * product.exchange_rate);
                            const calculatedPrice = Math.round(baseKrwPrice * (price_multiplier || 1)) + (price_add_amount || 0);
                            value.price_krw = calculatedPrice;
                        }
                    });
                }
            });
        }

        await redis.set(productKey, JSON.stringify(product));

        console.log(`💵 판매가 설정: ${productId} -> ₩${selling_price} (${price_multiplier}배 + ${price_add_amount}원)`);

        res.json({
            message: '판매가가 설정되었습니다',
            selling_price,
            price_multiplier,
            price_add_amount
        });

    } catch (error: any) {
        console.error('판매가 설정 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 업로드 마켓 정보 설정
app.put('/api/products/extracted/:productId/upload-market', async (req, res) => {
    try {
        const { productId } = req.params;
        const { uploaded_market, upload_status } = req.body;

        const productKey = `product:${productId}`;
        const existing = await redis.get(productKey);

        if (!existing) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }

        const product = JSON.parse(existing);

        if (uploaded_market) {
            product.uploaded_market = uploaded_market;
        }

        if (upload_status) {
            product.upload_status = upload_status;
        }

        product.updated_at = new Date().toISOString();

        await redis.set(productKey, JSON.stringify(product));

        console.log(`📤 업로드 마켓 설정: ${productId} -> ${uploaded_market} (${upload_status})`);

        res.json({
            message: '업로드 마켓 정보가 저장되었습니다',
            uploaded_market: product.uploaded_market,
            upload_status: product.upload_status
        });

    } catch (error: any) {
        console.error('업로드 마켓 설정 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 반품비 설정
app.put('/api/products/extracted/:productId/return-fee', async (req, res) => {
    try {
        const { productId } = req.params;
        const { return_fee } = req.body;

        const productKey = `product:${productId}`;
        const existing = await redis.get(productKey);

        if (!existing) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }

        const product = JSON.parse(existing);
        product.return_fee = return_fee;
        product.updated_at = new Date().toISOString();

        await redis.set(productKey, JSON.stringify(product));

        console.log(`💵 반품비 설정: ${productId} -> ₩${return_fee}`);

        res.json({
            message: '반품비가 설정되었습니다',
            return_fee: product.return_fee
        });

    } catch (error: any) {
        console.error('반품비 설정 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 키워드 저장
app.put('/api/products/extracted/:productId/keywords', async (req, res) => {
    try {
        const { productId } = req.params;
        const { keywords } = req.body;

        const productKey = `product:${productId}`;
        const existing = await redis.get(productKey);

        if (!existing) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }

        const product = JSON.parse(existing);
        product.keywords = keywords;
        product.updated_at = new Date().toISOString();

        await redis.set(productKey, JSON.stringify(product));

        console.log(`🔑 키워드 저장: ${productId}`);

        res.json({
            message: '키워드가 저장되었습니다',
            keywords: product.keywords
        });

    } catch (error: any) {
        console.error('키워드 저장 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 네이버 키워드 API - 키워드 생성 (쇼핑 인사이트 API 사용)
app.post('/api/keywords/generate', async (req, res) => {
    try {
        const { productTitle, categoryName } = req.body;

        // 환경설정에서 네이버 키워드 API 정보 가져오기
        const settingsData = await redis.get('app:settings');
        if (!settingsData) {
            return res.status(400).json({ error: '환경설정에서 네이버 키워드 API 정보를 먼저 등록해주세요' });
        }

        const settings = JSON.parse(settingsData);
        const {
            keyword_customer_id,
            keyword_access_license,
            keyword_secret_key
        } = settings;

        if (!keyword_customer_id || !keyword_access_license || !keyword_secret_key) {
            return res.status(400).json({ error: '환경설정에서 검색광고 API 정보(고객 ID, 액세스 라이선스, 비밀키)를 입력해주세요' });
        }

        // 1. 힌트 키워드 추출 (상품명 첫 2개 단어)
        let hintKeyword = '';

        if (productTitle) {
            const titleWords = productTitle
                .split(/[\s,/]+/)
                .filter((w: string) => w.length > 1);
            hintKeyword = titleWords.slice(0, 2).join(' ');
        }

        if (!hintKeyword) {
            hintKeyword = categoryName || '상품';
        }

        console.log(`🔍 힌트 키워드: "${hintKeyword}"`);

        // 2. 네이버 검색광고 API 서명 생성
        const timestamp = Date.now().toString();
        const method = 'GET';
        const uri = '/keywordstool';

        const message = `${timestamp}.${method}.${uri}`;
        const signature = crypto
            .createHmac('sha256', keyword_secret_key)
            .update(message)
            .digest('base64');

        console.log('🔐 API 서명 생성 완료');

        // 3. 네이버 검색광고 키워드 도구 API 호출
        try {
            const apiUrl = 'https://api.naver.com/keywordstool';

            const params = new URLSearchParams({
                hintKeywords: hintKeyword,
                showDetail: '1'
            });

            console.log('🌐 네이버 검색광고 API 요청:', {
                url: `${apiUrl}?${params.toString()}`,
                hintKeywords: hintKeyword
            });

            const response = await axios.get(`${apiUrl}?${params.toString()}`, {
                headers: {
                    'X-Timestamp': timestamp,
                    'X-API-KEY': keyword_access_license,
                    'X-Customer': keyword_customer_id,
                    'X-Signature': signature
                }
            });

            console.log('✅ 네이버 API 응답:', JSON.stringify(response.data).substring(0, 300));

            let keywords: string[] = [];

            // API 응답에서 연관 키워드 추출
            if (response.data && response.data.keywordList) {
                // keywordList에서 relKeyword 추출 (최대 10개)
                keywords = response.data.keywordList
                    .map((item: any) => item.relKeyword)
                    .filter((k: string) => k && k.length > 0)
                    .slice(0, 10);

                console.log(`🔑 연관 키워드 ${keywords.length}개 추출`);
            }

            // API에서 키워드를 가져오지 못한 경우
            if (keywords.length === 0) {
                console.log('⚠️ API에서 키워드를 가져오지 못했습니다. 상품명에서 추출합니다.');

                if (productTitle) {
                    const titleWords = productTitle
                        .split(/[\s,/]+/)
                        .map((w: string) => w.trim())
                        .filter((w: string) => w.length > 1);
                    keywords.push(...titleWords);
                }

                if (categoryName) {
                    const categoryWords = categoryName
                        .split('>')
                        .map((w: string) => w.trim())
                        .filter((w: string) => w);
                    keywords.push(...categoryWords);
                }

                keywords = Array.from(new Set(keywords)).slice(0, 10);
            }

            console.log(`🔑 최종 키워드: ${keywords.length}개 - ${keywords.join(', ')}`);

            res.json({
                keywords: keywords,
                count: keywords.length
            });

        } catch (apiError: any) {
            console.error('네이버 API 오류:', apiError.response?.data || apiError.message);

            if (apiError.response) {
                console.error('API 오류 상태:', apiError.response.status);
                console.error('API 오류 헤더:', apiError.response.headers);
                console.error('API 오류 상세:', JSON.stringify(apiError.response.data));
            }

            // API 오류 시 상품명에서 키워드 추출
            let fallbackKeywords: string[] = [];

            if (productTitle) {
                const titleWords = productTitle
                    .split(/[\s,/]+/)
                    .map((w: string) => w.trim())
                    .filter((w: string) => w.length > 1);
                fallbackKeywords.push(...titleWords);
            }

            if (categoryName) {
                const categoryWords = categoryName
                    .split('>')
                    .map((w: string) => w.trim())
                    .filter((w: string) => w);
                fallbackKeywords.push(...categoryWords);
            }

            const keywords = Array.from(new Set(fallbackKeywords)).slice(0, 10);

            console.log(`🔑 대체 키워드 (API 실패): ${keywords.length}개`);

            res.json({
                keywords: keywords,
                count: keywords.length,
                warning: 'API 호출 실패, 상품명에서 키워드를 추출했습니다'
            });
        }

    } catch (error: any) {
        console.error('키워드 생성 오류:', error.response?.data || error.message);

        // API 에러 상세 정보 로깅
        if (error.response) {
            console.error('API 에러 상태:', error.response.status);
            console.error('API 에러 데이터:', error.response.data);
        }

        // 에러 시 상품명에서 간단히 추출
        const { productTitle, categoryName } = req.body;
        const fallbackKeywords: string[] = [];

        if (productTitle) {
            const titleWords = productTitle.split(/[\s,/]+/).filter((word: string) => word.length > 1);
            fallbackKeywords.push(...titleWords.slice(0, 5));
        }

        if (categoryName) {
            const categoryWords = categoryName.split('>').map((w: string) => w.trim()).filter((w: string) => w);
            fallbackKeywords.push(...categoryWords);
        }

        const uniqueKeywords = Array.from(new Set(fallbackKeywords)).slice(0, 10);

        res.json({
            keywords: uniqueKeywords,
            count: uniqueKeywords.length,
            warning: 'API 호출 실패, 상품명에서 키워드를 추출했습니다'
        });
    }
});

// 배송 설정 (무료배송/유료배송, 배송비)
app.put('/api/products/extracted/:productId/shipping', async (req, res) => {
    try {
        const { productId } = req.params;
        const { free_shipping, shipping_fee } = req.body;

        const productKey = `product:${productId}`;
        const existing = await redis.get(productKey);

        if (!existing) {
            return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
        }

        const product = JSON.parse(existing);
        product.free_shipping = free_shipping;

        if (!free_shipping && shipping_fee !== undefined) {
            product.shipping_fee = shipping_fee;

            // 최근 배송비 목록 관리 (최대 5개)
            if (!product.recent_shipping_fees) {
                product.recent_shipping_fees = [];
            }

            // 중복 제거 및 새 배송비 추가
            product.recent_shipping_fees = product.recent_shipping_fees.filter((fee: number) => fee !== shipping_fee);
            product.recent_shipping_fees.unshift(shipping_fee);

            // 최대 5개까지만 유지
            if (product.recent_shipping_fees.length > 5) {
                product.recent_shipping_fees = product.recent_shipping_fees.slice(0, 5);
            }
        }

        product.updated_at = new Date().toISOString();

        await redis.set(productKey, JSON.stringify(product));

        console.log(`🚚 배송 설정: ${productId} -> ${free_shipping ? '무료배송' : `유료배송 (₩${shipping_fee})`}`);

        res.json({
            message: '배송 설정이 완료되었습니다',
            free_shipping,
            shipping_fee: product.shipping_fee,
            recent_shipping_fees: product.recent_shipping_fees || []
        });

    } catch (error: any) {
        console.error('배송 설정 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 환경설정 조회
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await redis.get('app:settings');
        if (settings) {
            res.json(JSON.parse(settings));
        } else {
            // 기본 설정 반환
            res.json({
                api_enabled: 'Y',
                seller_id: '',
                store_url: '',
                store_name: '',
                origin_code: '',
                return_code: '',
                purchase_point: 0,
                text_review_point: 200,
                photo_review_point: 500,
                text_review_point_month: 500,
                photo_review_point_month: 500,
                daily_review_point: 500,
                as_phone: '',
                as_guide: '',
                extra_shipping_enabled: 'Y',
                shipping_management: '2관식',
                extra_shipping_fee: 5000,
                brand_name: '',
                manufacturer_name: '',
                shipping_days: 14,
                purchase_limit: 99,
                ai_model: 'GPT',
                payment_unit: 100,
                fixed_rate: 210,
                currency_unit: 'USD'
            });
        }
    } catch (error: any) {
        console.error('설정 조회 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 환경설정 저장
app.post('/api/settings', async (req, res) => {
    try {
        const settings = req.body;

        await redis.set('app:settings', JSON.stringify(settings));

        console.log('⚙️ 환경설정이 저장되었습니다');

        res.json({
            message: '환경설정이 저장되었습니다',
            settings
        });

    } catch (error: any) {
        console.error('설정 저장 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 파일 업로드 (이미지)
app.post('/api/upload/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '파일이 없습니다' });
        }

        const imageType = req.body.type || 'general'; // top, bottom, top_extra_1, etc.
        const uploadDir = path.join(STORAGE_DIR, 'uploads');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
        }

        const timestamp = Date.now();
        const ext = path.extname(req.file.originalname) || '.jpg';
        const filename = `${imageType}_${timestamp}${ext}`;
        const filepath = path.join(uploadDir, filename);

        fs.writeFileSync(filepath, req.file.buffer);

        const imageUrl = `/images/uploads/${filename}`;

        console.log(`📤 이미지 업로드: ${filename} (${Math.round(req.file.size / 1024)}KB)`);

        res.json({
            success: true,
            url: imageUrl,
            filename
        });

    } catch (error: any) {
        console.error('파일 업로드 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// 환율 조회 (한국은행 API 또는 Fallback)
async function fetchExchangeRateFromAPI(): Promise<number> {
    try {
        // 무료 환율 API 사용 (exchangerate-api.com)
        const response = await fetch('https://open.er-api.com/v6/latest/CNY');
        const data: any = await response.json();

        if (data.rates && data.rates.KRW) {
            const rate = Math.round(data.rates.KRW);
            console.log(`💱 환율 조회 성공: 1 CNY = ${rate} KRW`);
            return rate;
        }

        throw new Error('환율 데이터 없음');
    } catch (error: any) {
        console.log(`⚠️ 환율 API 실패, 기본값 사용: ${error.message}`);
        return 190; // 기본 환율
    }
}

// 환율 업데이트 및 저장
async function updateExchangeRate() {
    try {
        const settings = await redis.get('app:settings');
        const settingsObj = settings ? JSON.parse(settings) : {};

        // 고정 환율 사용 여부 확인
        if (settingsObj.fixed_rate_toggle && settingsObj.fixed_rate) {
            console.log(`💱 고정 환율 사용: ${settingsObj.fixed_rate} KRW`);
            await redis.set('exchange_rate:cny_krw', settingsObj.fixed_rate.toString());
            return settingsObj.fixed_rate;
        }

        // API에서 환율 가져오기
        const rate = await fetchExchangeRateFromAPI();
        await redis.set('exchange_rate:cny_krw', rate.toString());

        return rate;
    } catch (error: any) {
        console.error('환율 업데이트 오류:', error);
        return 190;
    }
}

// 환율 조회 API
app.get('/api/exchange-rate', async (req, res) => {
    try {
        const cachedRate = await redis.get('exchange_rate:cny_krw');

        if (cachedRate) {
            res.json({ rate: parseInt(cachedRate), source: 'cache' });
        } else {
            const rate = await updateExchangeRate();
            res.json({ rate, source: 'api' });
        }
    } catch (error: any) {
        console.error('환율 조회 오류:', error);
        res.json({ rate: 190, source: 'default' });
    }
});

// 매일 오전 9시 환율 자동 업데이트
schedule.scheduleJob('0 9 * * *', async () => {
    console.log('⏰ 매일 오전 9시 환율 업데이트 시작');
    await updateExchangeRate();
});

// 카테고리 자동 갱신 스케줄러 (서버 시작 시 & 매일 자정)
async function scheduleCategoryUpdate() {
    // 시작 시 캐시 확인
    const cached = await redis.get('naver:categories');
    if (!cached && NAVER_CLIENT_ID && NAVER_CLIENT_SECRET) {
        console.log('🔄 네이버 카테고리 초기 로드 중...');
        try {
            const categories = await fetchNaverCategories();
            const tree = buildCategoryTree(categories);
            await redis.set('naver:categories', JSON.stringify({
                categories,
                tree,
                updatedAt: new Date().toISOString()
            }), 'EX', 86400);
            console.log(`✅ 네이버 카테고리 ${categories.length}개 로드 완료`);
        } catch (e: any) {
            console.log('⚠️ 네이버 카테고리 로드 실패:', e.message);
        }
    }
    
    // 매일 자정에 갱신 (24시간마다)
    setInterval(async () => {
        if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) return;
        
        console.log('🔄 네이버 카테고리 자동 갱신 중...');
        try {
            const categories = await fetchNaverCategories();
            const tree = buildCategoryTree(categories);
            await redis.set('naver:categories', JSON.stringify({
                categories,
                tree,
                updatedAt: new Date().toISOString()
            }), 'EX', 86400);
            console.log(`✅ 네이버 카테고리 자동 갱신 완료: ${categories.length}개`);
        } catch (e: any) {
            console.log('⚠️ 네이버 카테고리 자동 갱신 실패:', e.message);
        }
    }, 24 * 60 * 60 * 1000);  // 24시간
}

// 네이버 상품 목록 조회 (원산지 정보 확인용)
app.get('/api/naver/products', async (req, res) => {
    try {
        const accessToken = await getNaverAccessToken();

        const response = await fetch('https://api.commerce.naver.com/external/v2/products', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ 상품 목록 조회 실패:', errorData);
            return res.status(response.status).json(errorData);
        }

        const result = await response.json();
        console.log('✅ 상품 목록 조회 성공');

        res.json(result);
    } catch (error: any) {
        console.error('❌ 상품 목록 조회 오류:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 네이버 상품 상세 조회 (원산지 정보 확인용)
app.get('/api/naver/products/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const accessToken = await getNaverAccessToken();

        const response = await fetch(`https://api.commerce.naver.com/external/v2/products/origin-products/${productId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ 상품 상세 조회 실패:', errorData);
            return res.status(response.status).json(errorData);
        }

        const result: any = await response.json();
        console.log('✅ 상품 상세 조회 성공');
        console.log('원산지 정보:', JSON.stringify(result.originProduct?.detailAttribute?.originAreaInfo, null, 2));

        res.json(result);
    } catch (error: any) {
        console.error('❌ 상품 상세 조회 오류:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 네이버 원산지 코드 정보 전체 조회 API
app.get('/api/naver/origin-areas', async (req, res) => {
    try {
        const accessToken = await getNaverAccessToken();

        const response = await fetch('https://api.commerce.naver.com/external/v1/product-origin-areas', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ 원산지 코드 조회 실패:', errorData);
            return res.status(response.status).json(errorData);
        }

        const result: any = await response.json();
        console.log('✅ 원산지 코드 조회 성공');
        console.log('응답 데이터 구조:', JSON.stringify(result, null, 2));

        // 응답이 배열인지 객체인지 확인
        let areas = Array.isArray(result) ? result : (result.originAreas || result.data || []);

        // 중국 찾기
        if (Array.isArray(areas)) {
            const china = areas.find((area: any) => area.name && area.name.includes('중국'));
            if (china) {
                console.log('🇨🇳 중국 원산지 코드:', china.code, '-', china.name);
            }
        }

        res.json(result);
    } catch (error: any) {
        console.error('❌ 원산지 코드 조회 오류:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 서버 시작 시 스케줄러 실행
scheduleCategoryUpdate();

// 404 처리 (모든 라우트 정의 후 마지막에 배치)
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// 에러 핸들러 (404 핸들러 뒤에 배치)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('서버 에러:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, '0.0.0.0', async () => {
    console.log('========================================');
    console.log('🚀 서버 버전: v5.8');
    console.log(`🚀 서버 시작 완료: http://0.0.0.0:${PORT}`);
    console.log(`📁 이미지 저장: ${STORAGE_DIR}`);
    console.log(`🔍 디버그 API: http://localhost:${PORT}/api/debug/files`);
    console.log(`🔑 네이버 Client ID: ${NAVER_CLIENT_ID ? NAVER_CLIENT_ID.substring(0, 8) + '...' : '미설정'}`);
    console.log(`🔑 네이버 Client Secret: ${NAVER_CLIENT_SECRET ? '설정됨 (' + NAVER_CLIENT_SECRET.length + '자)' : '미설정'}`);
    console.log('========================================');

    // 서버 시작 시 환율 초기화
    await updateExchangeRate();
});
