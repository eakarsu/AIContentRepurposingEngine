const express = require('express');
const router = express.Router();
const axios = require('axios');
const authenticate = require('../middleware/auth');
const { aiRateLimiter } = require('../middleware/rateLimiter');

const SYSTEM_PROMPT = 'You are an expert content strategist and copywriter. Transform content into engaging, platform-optimized formats while maintaining brand voice.';
const MODEL = 'anthropic/claude-3-5-sonnet-20241022';
const MAX_CONTENT_BYTES = 50 * 1024;

async function callOpenRouter(prompt) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );
  return response.data.choices[0].message.content;
}

function validateContentSize(content) {
  if (!content) return null;
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_CONTENT_BYTES) {
    return `Content exceeds 50KB limit (${Math.round(bytes / 1024)}KB provided)`;
  }
  return null;
}

function checkApiKey(res) {
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your-openrouter-key-here') {
    res.status(503).json({ error: 'OpenRouter API key not configured.' });
    return false;
  }
  return true;
}

/**
 * POST /api/ai/content-audit
 * Gap analysis and repurposing opportunities across a content library.
 * Body: { content_library_ids[] }
 */
router.post('/content-audit', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { content_library_ids } = req.body;

    if (!Array.isArray(content_library_ids) || content_library_ids.length === 0) {
      return res.status(400).json({ error: 'content_library_ids must be a non-empty array' });
    }
    if (content_library_ids.length > 50) {
      return res.status(400).json({ error: 'content_library_ids cannot exceed 50 items per audit' });
    }
    if (!checkApiKey(res)) return;

    const prompt = `Perform a comprehensive content audit for a content library containing ${content_library_ids.length} pieces (IDs: ${content_library_ids.join(', ')}).

Provide:
1. Content Gap Analysis
   - Missing content types (video, podcast, infographic, long-form, short-form)
   - Underrepresented topics or audience segments
   - Missing stages of the buyer journey (awareness, consideration, decision)

2. Repurposing Opportunities
   - Top 5 high-potential repurposing combinations (e.g., blog → video script + email + thread)
   - Estimated effort vs. impact matrix
   - Quick wins (low effort, high impact)

3. Content Distribution Audit
   - Which platforms are underserved
   - Recommended content mix by platform

4. Content Performance Patterns
   - Which content types typically perform best for each platform
   - Recommended posting frequency adjustments

5. Action Plan
   - Prioritized list of next 10 content pieces to create
   - Repurposing queue recommendations

Provide specific, actionable recommendations.`;

    const audit = await callOpenRouter(prompt);
    res.json({
      content_audit: audit,
      items_analyzed: content_library_ids.length,
      model: MODEL,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('content-audit error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate content audit' });
  }
});

/**
 * POST /api/ai/tone-matcher
 * Rewrites content to match a reference brand voice/tone.
 * Body: { reference_content, target_tone }
 */
router.post('/tone-matcher', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { reference_content, target_tone } = req.body;

    if (!reference_content || typeof reference_content !== 'string' || reference_content.trim() === '') {
      return res.status(400).json({ error: 'reference_content is required' });
    }
    if (!target_tone || typeof target_tone !== 'string' || target_tone.trim() === '') {
      return res.status(400).json({ error: 'target_tone is required' });
    }

    const sizeError = validateContentSize(reference_content);
    if (sizeError) return res.status(400).json({ error: sizeError });
    if (!checkApiKey(res)) return;

    const prompt = `Analyze the following reference content and rewrite it to perfectly match the specified brand voice.

Reference Content:
${reference_content}

Target Tone/Brand Voice: ${target_tone}

Provide:
1. Brand Voice Analysis
   - Key characteristics detected in the reference (vocabulary level, sentence structure, personality traits)
   - Tone descriptors (e.g., authoritative, friendly, witty, empathetic)

2. Tone Transformation Guide
   - Specific vocabulary shifts needed
   - Sentence structure adjustments
   - Personality elements to amplify/reduce

3. Rewritten Content
   - Full rewrite matching the target tone: "${target_tone}"
   - Maintains the original message and key information
   - Naturally reads as if written by a brand with that voice

4. Tone Consistency Checklist
   - 5 rules to follow when writing in this brand voice
   - Words/phrases to use and avoid

Return the rewritten content clearly marked so it can be easily extracted.`;

    const result = await callOpenRouter(prompt);
    res.json({
      tone_matched_content: result,
      target_tone,
      model: MODEL,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('tone-matcher error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate tone-matched content' });
  }
});

/**
 * POST /api/ai/content-series
 * Generates a multi-part content series plan.
 * Body: { topic, num_pieces, platforms[] }
 */
router.post('/content-series', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { topic, num_pieces, platforms } = req.body;

    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      return res.status(400).json({ error: 'topic is required' });
    }
    if (!num_pieces || isNaN(num_pieces) || num_pieces < 2 || num_pieces > 52) {
      return res.status(400).json({ error: 'num_pieces must be a number between 2 and 52' });
    }
    if (!Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({ error: 'platforms must be a non-empty array' });
    }
    if (!checkApiKey(res)) return;

    const prompt = `Create a comprehensive ${num_pieces}-part content series plan for the following topic.

Topic: ${topic}
Number of Pieces: ${num_pieces}
Target Platforms: ${platforms.join(', ')}

Generate:
1. Series Overview
   - Series title and tagline
   - Core theme and narrative arc
   - Target audience profile
   - Series goals and KPIs

2. Content Calendar (all ${num_pieces} pieces)
   For each piece provide:
   - Piece number and title
   - Content angle/hook
   - Format recommendation per platform (${platforms.join(', ')})
   - Key talking points (3-5 bullets)
   - Call-to-action
   - Connection to previous/next piece (narrative thread)
   - Estimated publish date offset (Week X)

3. Cross-Platform Adaptation Strategy
   - How each piece adapts across ${platforms.join(', ')}
   - Platform-specific format notes
   - Repurposing flow diagram (text description)

4. Series Promotion Plan
   - How to announce the series
   - Teaser content ideas
   - Engagement tactics between pieces

5. Success Metrics
   - What to track for each platform
   - Milestone checkpoints

Make this series feel cohesive with a clear narrative that keeps audiences coming back for each installment.`;

    const series = await callOpenRouter(prompt);
    res.json({
      content_series: series,
      topic,
      num_pieces: parseInt(num_pieces),
      platforms,
      model: MODEL,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('content-series error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate content series' });
  }
});

/**
 * POST /api/ai/ab-test-variants
 * Generates A/B test headline variants with performance reasoning.
 * Body: { headline, num_variants }
 */
router.post('/ab-test-variants', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { headline, num_variants } = req.body;

    if (!headline || typeof headline !== 'string' || headline.trim() === '') {
      return res.status(400).json({ error: 'headline is required' });
    }
    if (num_variants !== undefined && (isNaN(num_variants) || num_variants < 2 || num_variants > 10)) {
      return res.status(400).json({ error: 'num_variants must be between 2 and 10' });
    }
    if (!checkApiKey(res)) return;

    const count = parseInt(num_variants) || 5;

    const prompt = `Generate ${count} A/B test variants for the following headline, each designed to test a different psychological trigger or copywriting approach.

Original Headline: "${headline}"

For each variant provide:
1. Variant letter (A, B, C, etc.)
2. The headline variant (rewritten)
3. Copywriting formula used (curiosity gap, benefit-driven, urgency, social proof, contrarian, how-to, numbered list, question, power word, etc.)
4. Primary psychological trigger (fear of missing out, desire, curiosity, trust, authority, etc.)
5. Performance prediction: which audience segment this will resonate with most
6. Expected CTR impact vs. original (e.g., +15% for high-intent B2B audience)
7. Ideal platforms/channels for this variant
8. Testing recommendation (when and how to deploy this variant)

After listing all variants, provide:
- Testing methodology recommendation (split % per variant)
- Primary metric to track (CTR, open rate, conversion rate)
- Recommended test duration
- Statistical significance threshold to aim for
- Decision framework: how to pick the winner

Make variants meaningfully different — each should test a distinct hypothesis.`;

    const variants = await callOpenRouter(prompt);
    res.json({
      original_headline: headline,
      num_variants: count,
      ab_test_variants: variants,
      model: MODEL,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('ab-test-variants error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate A/B test variants' });
  }
});

/**
 * POST /api/ai/extract-key-points  (audit gap)
 * Body: { content }
 */
router.post('/extract-key-points', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    const sizeErr = validateContentSize(content);
    if (sizeErr) return res.status(400).json({ error: sizeErr });
    if (!checkApiKey(res)) return;

    const prompt = `Extract the most useful key points from the following content. Return a JSON object with:
- key_points: array of {point, importance (high/medium/low), supporting_evidence_or_quote}
- one_sentence_summary: string
- pull_quotes: array of strings (memorable quotable sentences from the content)
- best_repurposing_use: short suggestion of how these key points are best repurposed (e.g., listicle, twitter thread).

CONTENT:
${content}`;
    const result = await callOpenRouter(prompt);
    res.json({ result, model: MODEL, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('extract-key-points error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to extract key points' });
  }
});

/**
 * POST /api/ai/suggest-hashtags  (audit gap)
 * Body: { content, platform? }
 */
router.post('/suggest-hashtags', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { content, platform } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    const sizeErr = validateContentSize(content);
    if (sizeErr) return res.status(400).json({ error: sizeErr });
    if (!checkApiKey(res)) return;

    const target = platform || 'generic';
    const prompt = `Suggest hashtags for the following content optimized for "${target}" (twitter/x/instagram/linkedin/tiktok/etc).

Return a JSON object with:
- broad_reach: array of high-volume general hashtags
- niche: array of mid-volume niche hashtags
- branded: suggested branded hashtag if relevant
- avoid: hashtags that look spammy or are over-saturated and should be avoided
- recommended_set: a final recommended array of 8-15 hashtags ordered by priority

CONTENT:
${content}`;
    const result = await callOpenRouter(prompt);
    res.json({ result, platform: target, model: MODEL, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('suggest-hashtags error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to suggest hashtags' });
  }
});

/**
 * POST /api/ai/generate-thumbnail-concepts  (audit gap)
 * Body: { content_summary, platform? }
 *
 * Returns text concepts for thumbnail design (no image generation in-server).
 */
router.post('/generate-thumbnail-concepts', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { content_summary, platform } = req.body;
    if (!content_summary) return res.status(400).json({ error: 'content_summary is required' });
    if (!checkApiKey(res)) return;

    const target = platform || 'youtube';
    const prompt = `Propose thumbnail/cover-art concepts for "${target}" given this content summary:

"${content_summary}"

Return a JSON object with:
- concepts: array of {title_overlay, focal_imagery, color_palette, mood, expected_ctr (low/medium/high), rationale}
- text_overlay_recommendations: short rules (font weight, length, contrast).
- a_b_test_pair: two concepts that contrast (different framings) to test.
- platform_constraints: notes about size/safe-zone/policy specific to "${target}".`;
    const result = await callOpenRouter(prompt);
    res.json({ result, platform: target, model: MODEL, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('generate-thumbnail-concepts error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate thumbnail concepts' });
  }
});

/**
 * POST /api/ai/multi-language-adapt  (apply pass 4)
 * Body: { content, target_languages[] (e.g. ['es','fr','ja']), preserve_tone? }
 * Multi-language adaptation with cultural localization (LLM-only, no translation API).
 */
router.post('/multi-language-adapt', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { content, target_languages, preserve_tone } = req.body || {};
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }
    const sizeErr = validateContentSize(content);
    if (sizeErr) return res.status(400).json({ error: sizeErr });
    if (!Array.isArray(target_languages) || target_languages.length === 0) {
      return res.status(400).json({ error: 'target_languages must be a non-empty array' });
    }
    if (target_languages.length > 10) {
      return res.status(400).json({ error: 'target_languages cannot exceed 10 entries' });
    }
    if (!checkApiKey(res)) return;

    const prompt = `Adapt the following content into each of these languages with cultural localization (not just translation).
Languages: ${target_languages.join(', ')}
Preserve tone: ${preserve_tone === false ? 'no — adapt tone for the local market' : 'yes — keep close to source tone'}

Return a JSON object:
{
  "adaptations": [
    { "language": string, "locale_hint": string, "title_or_hook": string, "body": string,
      "cultural_notes": [string], "idiom_replacements": [{"source_phrase": string, "localized": string}],
      "do_not_use": [string] }
  ],
  "overall_localization_strategy": string,
  "shared_assets_to_keep": [string]
}

CONTENT:
${content}`;
    const result = await callOpenRouter(prompt);
    res.json({ result, target_languages, model: MODEL, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('multi-language-adapt error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to adapt content' });
  }
});

/**
 * POST /api/ai/predict-performance  (apply pass 4)
 * Body: { content, platform, audience_description?, historical_summary? }
 * Performance prediction using only descriptive inputs (no analytics integration).
 */
router.post('/predict-performance', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { content, platform, audience_description, historical_summary } = req.body || {};
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }
    const sizeErr = validateContentSize(content);
    if (sizeErr) return res.status(400).json({ error: sizeErr });
    if (!checkApiKey(res)) return;

    const target = platform || 'generic';
    const prompt = `Predict the likely performance of this content piece on "${target}". You do NOT have analytics — base your prediction on copywriting heuristics, hook strength, format fit, and stated context.

Audience: ${audience_description || 'unspecified'}
Historical performance hint: ${historical_summary || 'none provided'}

Return a JSON object:
{
  "predicted_metrics": {
    "ctr_band": "low|medium|high",
    "engagement_band": "low|medium|high",
    "save_share_band": "low|medium|high",
    "expected_completion_rate_band": "low|medium|high"
  },
  "strengths": [string],
  "weaknesses": [string],
  "format_fit_score_0_to_100": number,
  "hook_strength_score_0_to_100": number,
  "rewrite_recommendations": [{ "what_to_change": string, "expected_lift": string }],
  "best_posting_window_hint": string,
  "confidence_caveat": string
}

CONTENT:
${content}`;
    const result = await callOpenRouter(prompt);
    res.json({ result, platform: target, model: MODEL, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('predict-performance error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to predict performance' });
  }
});

/**
 * POST /api/ai/expand-content  (apply pass 4)
 * Body: { seed, target_formats[] (e.g. ['blog','tweet-thread','newsletter','tiktok-script']), brand_voice? }
 * Agentic full-cycle expansion: one seed → coordinated multi-format set with shared narrative spine.
 */
router.post('/expand-content', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { seed, target_formats, brand_voice } = req.body || {};
    if (!seed || typeof seed !== 'string' || seed.trim() === '') {
      return res.status(400).json({ error: 'seed is required' });
    }
    const sizeErr = validateContentSize(seed);
    if (sizeErr) return res.status(400).json({ error: sizeErr });
    if (!Array.isArray(target_formats) || target_formats.length === 0) {
      return res.status(400).json({ error: 'target_formats must be a non-empty array' });
    }
    if (target_formats.length > 12) {
      return res.status(400).json({ error: 'target_formats cannot exceed 12 entries' });
    }
    if (!checkApiKey(res)) return;

    const prompt = `Act as an agentic content expansion planner. From the single seed below, produce a coordinated multi-format set that shares a narrative spine. Each format must reinforce the spine while respecting that format's native conventions.

Seed: ${seed}
Target formats: ${target_formats.join(', ')}
Brand voice (optional): ${brand_voice || 'unspecified — infer something professional and warm'}

Return a JSON object:
{
  "narrative_spine": { "core_promise": string, "core_proof": string, "core_emotion": string },
  "shared_assets": { "key_phrases": [string], "stats_or_quotes": [string], "ctas": [string] },
  "expansions": [
    {
      "format": string,
      "title_or_hook": string,
      "structure": [string],
      "draft": string,
      "publishing_notes": string,
      "internal_links_to_other_formats": [string]
    }
  ],
  "rollout_sequence": [string],
  "qa_checklist": [string]
}`;
    const result = await callOpenRouter(prompt);
    res.json({ result, target_formats, model: MODEL, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('expand-content error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to expand content' });
  }
});

/**
 * POST /api/ai/audience-segment  (apply pass 4)
 * Body: { content_or_brief, platforms? }
 * Audience segmentation analysis — identifies discrete segments and tailored angles per segment.
 */
router.post('/audience-segment', authenticate, aiRateLimiter, async (req, res) => {
  try {
    const { content_or_brief, platforms } = req.body || {};
    if (!content_or_brief || typeof content_or_brief !== 'string') {
      return res.status(400).json({ error: 'content_or_brief is required' });
    }
    const sizeErr = validateContentSize(content_or_brief);
    if (sizeErr) return res.status(400).json({ error: sizeErr });
    if (!checkApiKey(res)) return;

    const targetPlatforms = Array.isArray(platforms) && platforms.length ? platforms : ['generic'];
    const prompt = `Identify discrete audience segments for the following content/brief and provide tailored messaging angles per segment.

Brief / source content:
${content_or_brief}

Platforms in scope: ${targetPlatforms.join(', ')}

Return a JSON object:
{
  "segments": [
    {
      "name": string,
      "description": string,
      "demographics": { "age_band": string, "role_or_lifestyle": string, "intent_stage": string },
      "pain_points": [string],
      "preferred_channels": [string],
      "angle_or_message": string,
      "hook_examples": [string],
      "objections_and_rebuttals": [{ "objection": string, "rebuttal": string }],
      "expected_priority_score_0_to_100": number
    }
  ],
  "segment_overlap_warnings": [string],
  "recommended_primary_segment": string,
  "platform_segment_matrix": [
    { "platform": string, "best_segments": [string], "why": string }
  ]
}`;
    const result = await callOpenRouter(prompt);
    res.json({ result, platforms: targetPlatforms, model: MODEL, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('audience-segment error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to segment audience' });
  }
});

module.exports = router;
