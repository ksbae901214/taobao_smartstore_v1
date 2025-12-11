-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    smartstore_api_key VARCHAR(255),
    smartstore_secret VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Taobao Stores Table
CREATE TABLE IF NOT EXISTS taobao_stores (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    store_url TEXT NOT NULL,
    store_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    check_interval INTEGER DEFAULT 60,
    last_checked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stores_user_active ON taobao_stores(user_id, is_active);

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES taobao_stores(id) ON DELETE CASCADE,
    taobao_product_id VARCHAR(100) UNIQUE,
    taobao_url TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'scraped',
    title_cn TEXT,
    title_kr TEXT,
    price_cny DECIMAL(10, 2),
    price_krw DECIMAL(10, 0),
    description_cn TEXT,
    description_kr TEXT,
    category VARCHAR(100),
    stock_quantity INTEGER DEFAULT 0,
    crawled_at TIMESTAMP,
    uploaded_at TIMESTAMP,
    smartstore_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_store_status ON products(store_id, status);
CREATE INDEX IF NOT EXISTS idx_products_taobao_id ON products(taobao_product_id);

-- Product Images Table
CREATE TABLE IF NOT EXISTS product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    image_type VARCHAR(20) NOT NULL,
    original_url TEXT NOT NULL,
    stored_url TEXT,
    sort_order INTEGER DEFAULT 0,
    file_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id, image_type);

-- Product Options Table
CREATE TABLE IF NOT EXISTS product_options (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    option_name_cn VARCHAR(255),
    option_name_kr VARCHAR(255),
    option_values JSONB,
    price_diff DECIMAL(10, 2) DEFAULT 0,
    stock_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crawl Jobs Table
CREATE TABLE IF NOT EXISTS crawl_jobs (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES taobao_stores(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    products_found INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_store_status ON crawl_jobs(store_id, status);

DO $$
BEGIN
    RAISE NOTICE '✅ 데이터베이스 초기화 완료!';
END $$;
