-- AI Content Repurposing Engine - Database Schema
-- Run: psql -U postgres -d content_engine -f schema.sql

-- Drop tables if they exist (in reverse dependency order)
DROP TABLE IF EXISTS press_releases CASCADE;
DROP TABLE IF EXISTS ad_copy CASCADE;
DROP TABLE IF EXISTS content_translator CASCADE;
DROP TABLE IF EXISTS headlines CASCADE;
DROP TABLE IF EXISTS content_summaries CASCADE;
DROP TABLE IF EXISTS youtube_descriptions CASCADE;
DROP TABLE IF EXISTS instagram_captions CASCADE;
DROP TABLE IF EXISTS linkedin_posts CASCADE;
DROP TABLE IF EXISTS tweet_threads CASCADE;
DROP TABLE IF EXISTS seo_optimizer CASCADE;
DROP TABLE IF EXISTS email_newsletters CASCADE;
DROP TABLE IF EXISTS podcast_notes CASCADE;
DROP TABLE IF EXISTS video_scripts CASCADE;
DROP TABLE IF EXISTS blog_to_social CASCADE;
DROP TABLE IF EXISTS content_library CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 1. Content Library
CREATE TABLE content_library (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 2. Blog to Social Media
CREATE TABLE blog_to_social (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Video Scripts
CREATE TABLE video_scripts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Podcast Show Notes
CREATE TABLE podcast_notes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Email Newsletters
CREATE TABLE email_newsletters (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 6. SEO Content Optimizer
CREATE TABLE seo_optimizer (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 7. Tweet Thread Generator
CREATE TABLE tweet_threads (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 8. LinkedIn Post Generator
CREATE TABLE linkedin_posts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 9. Instagram Caption Generator
CREATE TABLE instagram_captions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 10. YouTube Description Generator
CREATE TABLE youtube_descriptions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 11. Content Summarizer
CREATE TABLE content_summaries (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 12. Headline Generator
CREATE TABLE headlines (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 13. Content Style Translator
CREATE TABLE content_translator (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 14. Ad Copy Generator
CREATE TABLE ad_copy (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 15. Press Release Generator
CREATE TABLE press_releases (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  ai_output TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_content_library_user ON content_library(user_id);
CREATE INDEX idx_blog_to_social_user ON blog_to_social(user_id);
CREATE INDEX idx_video_scripts_user ON video_scripts(user_id);
CREATE INDEX idx_podcast_notes_user ON podcast_notes(user_id);
CREATE INDEX idx_email_newsletters_user ON email_newsletters(user_id);
CREATE INDEX idx_seo_optimizer_user ON seo_optimizer(user_id);
CREATE INDEX idx_tweet_threads_user ON tweet_threads(user_id);
CREATE INDEX idx_linkedin_posts_user ON linkedin_posts(user_id);
CREATE INDEX idx_instagram_captions_user ON instagram_captions(user_id);
CREATE INDEX idx_youtube_descriptions_user ON youtube_descriptions(user_id);
CREATE INDEX idx_content_summaries_user ON content_summaries(user_id);
CREATE INDEX idx_headlines_user ON headlines(user_id);
CREATE INDEX idx_content_translator_user ON content_translator(user_id);
CREATE INDEX idx_ad_copy_user ON ad_copy(user_id);
CREATE INDEX idx_press_releases_user ON press_releases(user_id);
