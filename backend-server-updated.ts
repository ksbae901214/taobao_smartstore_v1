import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer } from 'http';
import Redis from 'ioredis';

const app = express();
const PORT = process.env.PORT || 3000;

// Redis 연결
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

app.use(helmet({
    contentSecurityPolicy: false, // HTML 서빙을 위해 비활성화
}));
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: '타오바오→스마트스토어 시스템 정상 작동 중',
        timestamp: new Date().toISOString()
    });
});

// API 상태
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// 크롤링 API
app.post('/api/crawl', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: '타오바오 URL이 필요합니다' });
        }

        // URL 검증
        if (!url.includes('taobao.com') && !url.includes('tmall.com')) {
            return res.status(400).json({ error: '유효한 타오바오/티몰 URL이 아닙니다' });
        }

        // 상품 ID 추출
        const productIdMatch = url.match(/id=(\d+)/);
        if (!productIdMatch) {
            return res.status(400).json({ error: '상품 ID를 찾을 수 없습니다' });
        }

        const productId = productIdMatch[1];

        // Redis 큐에 크롤링 작업 추가
        const job = {
            product_id: productId,
            url: url,
            timestamp: new Date().toISOString()
        };

        await redis.lpush('crawl_queue', JSON.stringify(job));

        console.log(`✅ 크롤링 작업 추가: ${productId}`);

        // 응답 (실제로는 작업 완료를 기다리거나 WebSocket으로 알림)
        res.json({
            status: 'queued',
            message: '크롤링 작업이 시작되었습니다',
            product_id: productId,
            job_id: Date.now()
        });

    } catch (error) {
        console.error('크롤링 API 에러:', error);
        res.status(500).json({ error: '크롤링 실패' });
    }
});

// 상품 목록 조회
app.get('/api/products', async (req, res) => {
    try {
        // TODO: 데이터베이스에서 상품 목록 조회
        res.json({
            products: [],
            total: 0
        });
    } catch (error) {
        console.error('상품 조회 에러:', error);
        res.status(500).json({ error: '상품 조회 실패' });
    }
});

// 상품 저장
app.post('/api/products', async (req, res) => {
    try {
        const productData = req.body;

        // TODO: 데이터베이스에 저장
        console.log('상품 저장:', productData);

        res.json({
            status: 'success',
            message: '상품이 저장되었습니다'
        });
    } catch (error) {
        console.error('상품 저장 에러:', error);
        res.status(500).json({ error: '상품 저장 실패' });
    }
});

// 404 처리
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// 에러 핸들러
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`🚀 Backend API 서버 시작: http://localhost:${PORT}`);
    console.log(`📍 메인 페이지: http://localhost:${PORT}`);
    console.log(`💚 Health Check: http://localhost:${PORT}/health`);
});
