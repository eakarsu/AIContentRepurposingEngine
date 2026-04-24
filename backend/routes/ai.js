const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');
const authenticate = require('../middleware/auth');

// Feature-specific prompt templates
const FEATURE_PROMPTS = {
  content_library: (title, content) =>
    `Analyze the following content and suggest the best repurposing strategies. Identify the key themes, target audiences, and recommend which formats (social media, video, podcast, email, etc.) would work best for repurposing.\n\nTitle: ${title}\n\nContent:\n${content}`,

  blog_to_social: (title, content) =>
    `Transform this blog post into engaging social media posts for Twitter, LinkedIn, Facebook, and Instagram. Each platform version should be optimized for that platform's best practices, character limits, and audience expectations. Include relevant hashtags and emojis where appropriate.\n\nBlog Title: ${title}\n\nBlog Content:\n${content}`,

  video_scripts: (title, content) =>
    `Create a compelling video script from this content. Include:\n1. An attention-grabbing intro hook (first 5 seconds)\n2. A brief intro/welcome segment\n3. Main content broken into clear sections with talking points\n4. Engagement prompts (ask viewers to comment/like)\n5. A strong call to action\n6. Outro\n\nFormat it with clear scene directions, on-screen text suggestions, and B-roll recommendations.\n\nTitle: ${title}\n\nSource Content:\n${content}`,

  podcast_notes: (title, content) =>
    `Generate detailed podcast show notes from this content. Include:\n1. Episode title and subtitle\n2. Episode summary (2-3 sentences)\n3. Detailed timestamps with topic descriptions\n4. Key takeaways (bulleted list)\n5. Notable quotes from the content\n6. Resources and links mentioned\n7. Guest bio (if applicable)\n8. Call to action for listeners\n\nTitle: ${title}\n\nContent:\n${content}`,

  email_newsletters: (title, content) =>
    `Create an engaging email newsletter from this content. Include:\n1. Subject line (3 variations: curiosity-driven, benefit-driven, urgency-driven)\n2. Preview text\n3. Personalized greeting\n4. Opening hook\n5. Main body with clear sections and formatting\n6. Key takeaways or tips\n7. Call-to-action button text and context\n8. P.S. line\n\nTitle: ${title}\n\nContent:\n${content}`,

  seo_optimizer: (title, content) =>
    `Optimize this content for SEO. Provide:\n1. Optimized meta title (under 60 characters)\n2. Meta description (under 160 characters)\n3. Primary keyword and 5-7 secondary keywords\n4. Optimized H1, H2, and H3 header structure\n5. SEO-optimized version of the content with natural keyword placement\n6. Internal linking suggestions\n7. Image alt text suggestions\n8. Schema markup recommendations\n9. Readability score improvements\n\nTitle: ${title}\n\nContent:\n${content}`,

  tweet_threads: (title, content) =>
    `Create an engaging Twitter/X thread from this content. Requirements:\n1. Opening tweet with a strong hook that makes people want to read more\n2. 8-12 tweets that break down the key points\n3. Each tweet should stand alone but flow naturally into the next\n4. Use thread numbering (1/, 2/, etc.)\n5. Include relevant emojis sparingly\n6. Final tweet with a summary and call-to-action\n7. Suggest 3-5 relevant hashtags for the first tweet\n8. Keep each tweet under 280 characters\n\nTitle: ${title}\n\nContent:\n${content}`,

  linkedin_posts: (title, content) =>
    `Transform this into a professional LinkedIn post using storytelling format. Include:\n1. A hook in the first line that stops the scroll\n2. A personal or relatable story element\n3. Key insights with line breaks for readability\n4. Professional takeaways\n5. An engaging question to drive comments\n6. 3-5 relevant hashtags\n7. Keep it under 1300 characters for optimal engagement\n\nProvide 2 variations: one personal narrative style and one thought-leadership style.\n\nTitle: ${title}\n\nContent:\n${content}`,

  instagram_captions: (title, content) =>
    `Create Instagram captions from this content. Provide:\n1. Main caption with engaging opening line (shown before "more")\n2. Body with emojis, line breaks, and storytelling\n3. Call-to-action (save, share, comment)\n4. 20-30 relevant hashtags organized by category (industry, topic, general)\n5. Alt text for accessibility\n\nProvide 3 variations: educational, inspirational, and conversational tone.\n\nTitle: ${title}\n\nContent:\n${content}`,

  youtube_descriptions: (title, content) =>
    `Generate a YouTube video description from this content. Include:\n1. SEO-optimized first 2 lines (shown in search results)\n2. Detailed video summary\n3. Timestamps section (estimate logical timestamps)\n4. Key links section\n5. About the channel section\n6. Social media links placeholders\n7. Relevant tags (15-20)\n8. Hashtags (3-5 for above the title)\n9. Recommended cards and end screen suggestions\n\nTitle: ${title}\n\nContent:\n${content}`,

  content_summaries: (title, content) =>
    `Summarize this content comprehensively. Provide:\n1. Executive Summary (2-3 sentences)\n2. Key Points (bulleted list of 5-7 main points)\n3. Detailed Summary (3-4 paragraphs)\n4. Action Items (specific next steps readers can take)\n5. TL;DR (one sentence)\n6. Target audience identification\n7. Content themes and categories\n\nTitle: ${title}\n\nContent:\n${content}`,

  headlines: (title, content) =>
    `Generate 10 compelling headline variations for this content using different copywriting formulas:\n1. How-To headline\n2. Numbered list headline\n3. Question headline\n4. Benefit-driven headline\n5. Curiosity gap headline\n6. Social proof headline\n7. Urgency headline\n8. Contrarian/Controversial headline\n9. "The Ultimate Guide" format\n10. Power word headline\n\nFor each headline, note which formula it uses and why it works. Also rate each headline's estimated click-through potential (1-10).\n\nTitle: ${title}\n\nContent:\n${content}`,

  content_translator: (title, content) =>
    `Translate this content's style into multiple variations:\n1. Formal/Professional version\n2. Casual/Conversational version\n3. Academic/Technical version\n4. Gen Z/Youth-oriented version\n5. Executive briefing version\n\nFor each version, maintain the core message while adapting vocabulary, sentence structure, tone, and formatting to match the target style. Note key changes made for each translation.\n\nTitle: ${title}\n\nContent:\n${content}`,

  ad_copy: (title, content) =>
    `Create ad copy variations from this content:\n\n1. Google Search Ads (3 variations):\n   - Headline 1 (30 chars), Headline 2 (30 chars), Headline 3 (30 chars)\n   - Description 1 (90 chars), Description 2 (90 chars)\n\n2. Facebook/Instagram Ads (3 variations):\n   - Primary text, Headline, Description\n   - Suggested image/video concept\n\n3. LinkedIn Ads (2 variations):\n   - Intro text, Headline, Description\n\n4. Display Ad Copy (2 variations):\n   - Headline, Sub-headline, CTA button text\n\nFor each ad, include the target audience, value proposition, and suggested A/B testing elements.\n\nTitle: ${title}\n\nContent:\n${content}`,

  press_releases: (title, content) =>
    `Transform this into a professional press release. Include:\n1. "FOR IMMEDIATE RELEASE" header\n2. Compelling headline\n3. Subheadline\n4. Dateline (city, date)\n5. Strong opening paragraph (who, what, when, where, why)\n6. Supporting body paragraphs with quotes\n7. Boilerplate "About" section\n8. Media contact information placeholders\n9. "###" ending\n\nFollow AP style guidelines and keep it to one page (400-500 words).\n\nTitle: ${title}\n\nContent:\n${content}`
};

const FEATURE_TABLE_MAP = {
  'content_library': 'content_library',
  'blog_to_social': 'blog_to_social',
  'video_scripts': 'video_scripts',
  'podcast_notes': 'podcast_notes',
  'email_newsletters': 'email_newsletters',
  'seo_optimizer': 'seo_optimizer',
  'tweet_threads': 'tweet_threads',
  'linkedin_posts': 'linkedin_posts',
  'instagram_captions': 'instagram_captions',
  'youtube_descriptions': 'youtube_descriptions',
  'content_summaries': 'content_summaries',
  'headlines': 'headlines',
  'content_translator': 'content_translator',
  'ad_copy': 'ad_copy',
  'press_releases': 'press_releases'
};

// POST /api/ai/generate
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { feature, title, content } = req.body;

    if (!feature || !title || !content) {
      return res.status(400).json({ error: 'Feature, title, and content are required' });
    }

    const promptFn = FEATURE_PROMPTS[feature];
    if (!promptFn) {
      return res.status(400).json({
        error: `Invalid feature: ${feature}`,
        validFeatures: Object.keys(FEATURE_PROMPTS)
      });
    }

    const prompt = promptFn(title, content);

    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your-openrouter-key-here') {
      return res.status(503).json({
        error: 'OpenRouter API key not configured. Please set OPENROUTER_API_KEY in the .env file.'
      });
    }

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: process.env.OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: 'You are an expert content strategist and copywriter.' },
        { role: 'user', content: prompt }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiOutput = response.data.choices[0].message.content;

    res.json({
      ai_output: aiOutput,
      model: process.env.OPENROUTER_MODEL,
      feature
    });
  } catch (err) {
    console.error('AI generation error:', err.response?.data || err.message);
    if (err.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenRouter API key' });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }
    res.status(500).json({ error: 'Failed to generate AI content' });
  }
});

// POST /api/ai/generate-and-save
router.post('/generate-and-save', authenticate, async (req, res) => {
  try {
    const { feature, title, content } = req.body;

    if (!feature || !title || !content) {
      return res.status(400).json({ error: 'Feature, title, and content are required' });
    }

    const promptFn = FEATURE_PROMPTS[feature];
    if (!promptFn) {
      return res.status(400).json({
        error: `Invalid feature: ${feature}`,
        validFeatures: Object.keys(FEATURE_PROMPTS)
      });
    }

    const table = FEATURE_TABLE_MAP[feature];
    if (!table) {
      return res.status(400).json({ error: `No table mapping for feature: ${feature}` });
    }

    const prompt = promptFn(title, content);

    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your-openrouter-key-here') {
      return res.status(503).json({
        error: 'OpenRouter API key not configured. Please set OPENROUTER_API_KEY in the .env file.'
      });
    }

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: process.env.OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: 'You are an expert content strategist and copywriter.' },
        { role: 'user', content: prompt }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiOutput = response.data.choices[0].message.content;

    // Save to database
    let insertQuery, insertParams;
    if (feature === 'content_library') {
      insertQuery = `INSERT INTO ${table} (title, content, ai_output, status, category, user_id)
                     VALUES ($1, $2, $3, 'completed', $4, $5) RETURNING *`;
      insertParams = [title, content, aiOutput, req.body.category || null, req.user.id];
    } else {
      insertQuery = `INSERT INTO ${table} (title, content, ai_output, status, user_id)
                     VALUES ($1, $2, $3, 'completed', $4) RETURNING *`;
      insertParams = [title, content, aiOutput, req.user.id];
    }

    const result = await db.query(insertQuery, insertParams);

    res.status(201).json({
      item: result.rows[0],
      model: process.env.OPENROUTER_MODEL,
      feature
    });
  } catch (err) {
    console.error('AI generate-and-save error:', err.response?.data || err.message);
    if (err.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenRouter API key' });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }
    res.status(500).json({ error: 'Failed to generate and save AI content' });
  }
});

module.exports = router;
