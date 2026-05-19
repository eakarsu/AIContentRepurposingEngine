import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  FiArrowLeft, FiBarChart2, FiCalendar, FiTarget, FiLayers,
  FiActivity, FiTrendingUp, FiGlobe, FiHeart, FiUsers, FiZap,
  FiDownload, FiPlay, FiClock, FiList, FiHash, FiImage, FiFlag,
} from 'react-icons/fi';
import Navbar from '../components/Navbar';
import AIOutput from '../components/AIOutput';

const NEW_FEATURES = [
  {
    id: 'variant-predictor',
    title: 'Variant Performance Predictor',
    desc: 'AI estimates click-through and engagement for each headline/ad variant.',
    icon: FiTrendingUp,
    type: 'ab-test',
    endpoint: '/api/ai/ab-test-variants',
  },
  {
    id: 'repurposing-chain',
    title: 'Content Repurposing Chain',
    desc: 'Auto-generate social, email and ad variants from a single source.',
    icon: FiLayers,
    type: 'content-series',
    endpoint: '/api/ai/content-series',
  },
  {
    id: 'brand-voice-trainer',
    title: 'Brand Voice Trainer',
    desc: 'Learn your writing style then apply it to all generated variants.',
    icon: FiHeart,
    type: 'tone-matcher',
    endpoint: '/api/ai/tone-matcher',
  },
  {
    id: 'cross-platform-calendar',
    title: 'Cross-Platform Content Calendar',
    desc: 'Auto-schedule generated posts with optimal timing per platform.',
    icon: FiCalendar,
    type: 'calendar',
  },
  {
    id: 'competitor-analyzer',
    title: 'Competitor Copy Analyzer',
    desc: 'Extract competitor headlines and analyze them vs your variants.',
    icon: FiTarget,
    type: 'tone-matcher',
    endpoint: '/api/ai/tone-matcher',
    presetTone: 'analytical, comparison-driven competitive teardown',
  },
  {
    id: 'trending-integrator',
    title: 'Trending Topic Integrator',
    desc: 'Suggest hashtags and hooks by scanning real-time trending topics.',
    icon: FiActivity,
    type: 'content-series',
    endpoint: '/api/ai/content-series',
  },
  {
    id: 'multi-language',
    title: 'Multi-Language Repurposer',
    desc: 'Generate content in 10+ languages with cultural adaptation.',
    icon: FiGlobe,
    type: 'tone-matcher',
    endpoint: '/api/ai/tone-matcher',
    presetTone: 'native fluency in target language with cultural context adaptation',
  },
  {
    id: 'sentiment-aware',
    title: 'Sentiment-Aware Generation',
    desc: 'Generate variants tuned for specific emotional tone or audience.',
    icon: FiUsers,
    type: 'tone-matcher',
    endpoint: '/api/ai/tone-matcher',
  },
  {
    id: 'extract-key-points',
    title: 'Key Points Extractor',
    desc: 'Pull bullet-style insights and quotable lines from a long-form piece.',
    icon: FiList,
    type: 'key-points',
    endpoint: '/api/ai/extract-key-points',
  },
  {
    id: 'suggest-hashtags',
    title: 'Hashtag Suggester',
    desc: 'Get platform-aware hashtag suggestions for any topic or piece of content.',
    icon: FiHash,
    type: 'hashtags',
    endpoint: '/api/ai/suggest-hashtags',
  },
  {
    id: 'generate-thumbnail-concepts',
    title: 'Thumbnail Concepts',
    desc: 'Brainstorm thumbnail / hero image concepts (text-only descriptions).',
    icon: FiImage,
    type: 'thumbnails',
    endpoint: '/api/ai/generate-thumbnail-concepts',
  },
  {
    id: 'multi-language-adapt',
    title: 'Multi-Language Adaptation',
    desc: 'Localize content into multiple languages with cultural adaptation (not just translation).',
    icon: FiGlobe,
    type: 'multi-language',
    endpoint: '/api/ai/multi-language-adapt',
  },
  {
    id: 'predict-performance',
    title: 'Performance Predictor',
    desc: 'Heuristic prediction of CTR/engagement bands plus rewrite recommendations.',
    icon: FiFlag,
    type: 'predict-performance',
    endpoint: '/api/ai/predict-performance',
  },
  {
    id: 'expand-content',
    title: 'Agentic Content Expander',
    desc: 'One seed -> coordinated multi-format set with shared narrative spine.',
    icon: FiZap,
    type: 'expand-content',
    endpoint: '/api/ai/expand-content',
  },
  {
    id: 'audience-segment',
    title: 'Audience Segmenter',
    desc: 'Identify discrete audience segments and per-segment messaging angles.',
    icon: FiUsers,
    type: 'audience-segment',
    endpoint: '/api/ai/audience-segment',
  },
];

function AdvancedTools() {
  const navigate = useNavigate();
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const [activePanel, setActivePanel] = useState(null);
  const [loading, setLoading] = useState(null);
  const [results, setResults] = useState({});
  const [inputs, setInputs] = useState({});

  // Analytics
  const [analytics, setAnalytics] = useState(null);
  // Schedule
  const [schedule, setSchedule] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({ platform: 'twitter', publish_at: '', title: '' });

  useEffect(() => {
    axios.get('/api/analytics/repurpose-stats?days=30', { headers })
      .then(r => setAnalytics(r.data))
      .catch(() => setAnalytics(null));
    fetchSchedule();
  }, []);

  const fetchSchedule = () => {
    axios.get('/api/schedule/upcoming?days=14', { headers })
      .then(r => setSchedule(r.data?.upcoming || []))
      .catch(() => setSchedule([]));
  };

  const updateInput = (id, key, value) => {
    setInputs(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
  };

  const togglePanel = (id) => setActivePanel(activePanel === id ? null : id);

  const handleRun = async (feature) => {
    setLoading(feature.id);
    try {
      let res;
      const data = inputs[feature.id] || {};
      if (feature.type === 'ab-test') {
        res = await axios.post(feature.endpoint, {
          headline: data.headline || 'Boost your conversions with this one trick',
          num_variants: parseInt(data.num_variants, 10) || 5,
        }, { headers });
        setResults(prev => ({ ...prev, [feature.id]: res.data.ab_test_variants || res.data }));
      } else if (feature.type === 'content-series') {
        res = await axios.post(feature.endpoint, {
          topic: data.topic || 'AI tools for content creators',
          num_pieces: parseInt(data.num_pieces, 10) || 5,
          platforms: (data.platforms ? data.platforms.split(',').map(s => s.trim()) : ['twitter', 'linkedin', 'instagram']),
        }, { headers });
        setResults(prev => ({ ...prev, [feature.id]: res.data.content_series || res.data }));
      } else if (feature.type === 'tone-matcher') {
        res = await axios.post(feature.endpoint, {
          reference_content: data.reference_content || 'Insert your sample content here. The AI will adapt it to the target tone.',
          target_tone: data.target_tone || feature.presetTone || 'friendly, conversational, gen-z',
        }, { headers });
        setResults(prev => ({ ...prev, [feature.id]: res.data.tone_matched_content || res.data }));
      } else if (feature.type === 'key-points') {
        res = await axios.post(feature.endpoint, {
          content: data.content || '',
          max_points: parseInt(data.max_points, 10) || 8,
          style: data.style || 'concise',
        }, { headers });
        setResults(prev => ({ ...prev, [feature.id]: res.data.key_points || res.data }));
      } else if (feature.type === 'hashtags') {
        res = await axios.post(feature.endpoint, {
          topic: data.topic || data.content || '',
          platform: data.platform || 'instagram',
          count: parseInt(data.count, 10) || 15,
        }, { headers });
        setResults(prev => ({ ...prev, [feature.id]: res.data.hashtags || res.data }));
      } else if (feature.type === 'thumbnails') {
        res = await axios.post(feature.endpoint, {
          topic: data.topic || '',
          style: data.style || 'bold, high-contrast',
          count: parseInt(data.count, 10) || 5,
        }, { headers });
        setResults(prev => ({ ...prev, [feature.id]: res.data.concepts || res.data.thumbnail_concepts || res.data }));
      } else if (feature.type === 'multi-language') {
        const langs = (data.target_languages || 'es,fr,ja')
          .split(',').map(s => s.trim()).filter(Boolean);
        res = await axios.post(feature.endpoint, {
          content: data.content || '',
          target_languages: langs,
          preserve_tone: data.preserve_tone !== 'false',
        }, { headers });
        setResults(prev => ({ ...prev, [feature.id]: res.data.result || res.data }));
      } else if (feature.type === 'predict-performance') {
        res = await axios.post(feature.endpoint, {
          content: data.content || '',
          platform: data.platform || 'twitter',
          audience_description: data.audience_description || '',
          historical_summary: data.historical_summary || '',
        }, { headers });
        setResults(prev => ({ ...prev, [feature.id]: res.data.result || res.data }));
      } else if (feature.type === 'expand-content') {
        const formats = (data.target_formats || 'blog,tweet-thread,newsletter,tiktok-script')
          .split(',').map(s => s.trim()).filter(Boolean);
        res = await axios.post(feature.endpoint, {
          seed: data.seed || '',
          target_formats: formats,
          brand_voice: data.brand_voice || '',
        }, { headers });
        setResults(prev => ({ ...prev, [feature.id]: res.data.result || res.data }));
      } else if (feature.type === 'audience-segment') {
        const platforms = (data.platforms || '')
          .split(',').map(s => s.trim()).filter(Boolean);
        res = await axios.post(feature.endpoint, {
          content_or_brief: data.content_or_brief || '',
          platforms: platforms.length ? platforms : undefined,
        }, { headers });
        setResults(prev => ({ ...prev, [feature.id]: res.data.result || res.data }));
      }
      toast.success('Generated!');
    } catch (err) {
      if (err.response?.status === 503) {
        toast.error('OpenRouter API key not configured (503).');
        setResults(prev => ({ ...prev, [feature.id]: 'AI service unavailable: OPENROUTER_API_KEY is not configured.' }));
      } else {
        toast.error(err.response?.data?.error || 'Failed');
        setResults(prev => ({ ...prev, [feature.id]: 'Generation failed. Verify the backend AI service is running.' }));
      }
    }
    setLoading(null);
  };

  const handleScheduleAdd = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/schedule', scheduleForm, { headers });
      toast.success('Scheduled!');
      setScheduleForm({ platform: 'twitter', publish_at: '', title: '' });
      fetchSchedule();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Schedule failed');
    }
  };

  const handleScheduleDelete = async (id) => {
    try {
      await axios.delete(`/api/schedule/${id}`, { headers });
      toast.success('Removed');
      fetchSchedule();
    } catch {
      toast.error('Failed');
    }
  };

  const handleExport = async () => {
    try {
      const res = await axios.get('/api/export/content-library', {
        headers,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `content-library-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      toast.error('Export failed');
    }
  };

  const renderPanelInputs = (feature) => {
    const val = inputs[feature.id] || {};
    if (feature.type === 'ab-test') {
      return (
        <>
          <input className="form-input" placeholder="Original headline"
            value={val.headline || ''} onChange={e => updateInput(feature.id, 'headline', e.target.value)} />
          <input className="form-input" type="number" min="2" max="10"
            placeholder="Number of variants (default 5)"
            value={val.num_variants || ''} onChange={e => updateInput(feature.id, 'num_variants', e.target.value)} />
        </>
      );
    }
    if (feature.type === 'content-series') {
      return (
        <>
          <input className="form-input" placeholder="Topic"
            value={val.topic || ''} onChange={e => updateInput(feature.id, 'topic', e.target.value)} />
          <input className="form-input" type="number" min="2" max="52"
            placeholder="Number of pieces"
            value={val.num_pieces || ''} onChange={e => updateInput(feature.id, 'num_pieces', e.target.value)} />
          <input className="form-input" placeholder="Platforms (comma separated)"
            value={val.platforms || ''} onChange={e => updateInput(feature.id, 'platforms', e.target.value)} />
        </>
      );
    }
    if (feature.type === 'tone-matcher') {
      return (
        <>
          <textarea className="form-textarea" placeholder="Reference content / sample text"
            value={val.reference_content || ''} onChange={e => updateInput(feature.id, 'reference_content', e.target.value)} />
          <input className="form-input" placeholder={feature.presetTone || 'Target tone (e.g. friendly, gen-z)'}
            value={val.target_tone || ''} onChange={e => updateInput(feature.id, 'target_tone', e.target.value)} />
        </>
      );
    }
    if (feature.type === 'key-points') {
      return (
        <>
          <textarea className="form-textarea" placeholder="Long-form content to extract from"
            value={val.content || ''} onChange={e => updateInput(feature.id, 'content', e.target.value)} />
          <input className="form-input" type="number" min="3" max="20" placeholder="Max points (default 8)"
            value={val.max_points || ''} onChange={e => updateInput(feature.id, 'max_points', e.target.value)} />
          <input className="form-input" placeholder="Style (concise / detailed / quotable)"
            value={val.style || ''} onChange={e => updateInput(feature.id, 'style', e.target.value)} />
        </>
      );
    }
    if (feature.type === 'hashtags') {
      return (
        <>
          <input className="form-input" placeholder="Topic or content seed"
            value={val.topic || ''} onChange={e => updateInput(feature.id, 'topic', e.target.value)} />
          <select className="form-input" value={val.platform || 'instagram'}
            onChange={e => updateInput(feature.id, 'platform', e.target.value)}>
            {['instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'facebook'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input className="form-input" type="number" min="5" max="30" placeholder="Count (default 15)"
            value={val.count || ''} onChange={e => updateInput(feature.id, 'count', e.target.value)} />
        </>
      );
    }
    if (feature.type === 'thumbnails') {
      return (
        <>
          <input className="form-input" placeholder="Topic"
            value={val.topic || ''} onChange={e => updateInput(feature.id, 'topic', e.target.value)} />
          <input className="form-input" placeholder="Style (e.g. bold, high-contrast, minimalist)"
            value={val.style || ''} onChange={e => updateInput(feature.id, 'style', e.target.value)} />
          <input className="form-input" type="number" min="2" max="10" placeholder="Number of concepts (default 5)"
            value={val.count || ''} onChange={e => updateInput(feature.id, 'count', e.target.value)} />
        </>
      );
    }
    if (feature.type === 'multi-language') {
      return (
        <>
          <textarea className="form-textarea" placeholder="Source content to localize"
            value={val.content || ''} onChange={e => updateInput(feature.id, 'content', e.target.value)} />
          <input className="form-input" placeholder="Target languages comma-separated (e.g. es,fr,ja,pt-br)"
            value={val.target_languages || ''} onChange={e => updateInput(feature.id, 'target_languages', e.target.value)} />
          <select className="form-input" value={val.preserve_tone || 'true'}
            onChange={e => updateInput(feature.id, 'preserve_tone', e.target.value)}>
            <option value="true">Preserve source tone</option>
            <option value="false">Adapt tone for local market</option>
          </select>
        </>
      );
    }
    if (feature.type === 'predict-performance') {
      return (
        <>
          <textarea className="form-textarea" placeholder="Content to evaluate"
            value={val.content || ''} onChange={e => updateInput(feature.id, 'content', e.target.value)} />
          <select className="form-input" value={val.platform || 'twitter'}
            onChange={e => updateInput(feature.id, 'platform', e.target.value)}>
            {['twitter', 'linkedin', 'instagram', 'facebook', 'youtube', 'tiktok', 'email', 'blog'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input className="form-input" placeholder="Audience description (optional)"
            value={val.audience_description || ''} onChange={e => updateInput(feature.id, 'audience_description', e.target.value)} />
          <input className="form-input" placeholder="Historical performance hint (optional)"
            value={val.historical_summary || ''} onChange={e => updateInput(feature.id, 'historical_summary', e.target.value)} />
        </>
      );
    }
    if (feature.type === 'expand-content') {
      return (
        <>
          <textarea className="form-textarea" placeholder="Seed idea / source insight"
            value={val.seed || ''} onChange={e => updateInput(feature.id, 'seed', e.target.value)} />
          <input className="form-input" placeholder="Target formats comma-separated (e.g. blog,tweet-thread,newsletter,tiktok-script)"
            value={val.target_formats || ''} onChange={e => updateInput(feature.id, 'target_formats', e.target.value)} />
          <input className="form-input" placeholder="Brand voice (optional)"
            value={val.brand_voice || ''} onChange={e => updateInput(feature.id, 'brand_voice', e.target.value)} />
        </>
      );
    }
    if (feature.type === 'audience-segment') {
      return (
        <>
          <textarea className="form-textarea" placeholder="Content brief or source content"
            value={val.content_or_brief || ''} onChange={e => updateInput(feature.id, 'content_or_brief', e.target.value)} />
          <input className="form-input" placeholder="Platforms comma-separated (optional)"
            value={val.platforms || ''} onChange={e => updateInput(feature.id, 'platforms', e.target.value)} />
        </>
      );
    }
    return null;
  };

  return (
    <div className="feature-page">
      <Navbar breadcrumbs={[{ label: 'Advanced Tools' }]} />
      <div className="feature-content">
        <button className="back-button" onClick={() => navigate('/dashboard')}>
          <FiArrowLeft /> Back to Dashboard
        </button>

        <div className="feature-header">
          <div className="feature-header-left">
            <h2>Advanced Tools</h2>
            <p>AI-powered analytics, scheduling, brand voice, and 8 NEW non-CRUD features.</p>
          </div>
          <button className="btn btn-outline" onClick={handleExport}>
            <FiDownload /> Export Library CSV
          </button>
        </div>

        {/* Analytics summary */}
        {analytics && (
          <div className="table-container" style={{ marginBottom: 24, padding: 20 }}>
            <h3 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FiBarChart2 /> Repurpose Analytics (last {analytics.period_days} days)
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <Stat label="Total generations" value={analytics.summary?.total_generations || 0} />
              <Stat label="Recent" value={analytics.summary?.recent_generations || 0} />
              <Stat label="Library items" value={analytics.summary?.content_library_items || 0} />
              <Stat label="Most popular" value={analytics.summary?.most_popular_feature || 'n/a'} />
              <Stat label="Features used" value={analytics.summary?.unique_features_used || 0} />
            </div>
            <div style={{ marginTop: 16 }}>
              <h4 style={{ marginBottom: 8 }}>Top features</h4>
              <table className="table" style={{ fontSize: 13 }}>
                <thead>
                  <tr><th>Feature</th><th>Total uses</th><th>Completed</th><th>Recent</th></tr>
                </thead>
                <tbody>
                  {(analytics.features_ranked || []).slice(0, 6).map(f => (
                    <tr key={f.feature}>
                      <td>{f.feature}</td>
                      <td>{f.total_uses}</td>
                      <td>{f.completed}</td>
                      <td>{f.recent_uses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Calendar / scheduling */}
        <div className="table-container" style={{ marginBottom: 24, padding: 20 }}>
          <h3 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiCalendar /> Content Calendar
          </h3>
          <form onSubmit={handleScheduleAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <select className="form-input" style={{ maxWidth: 160 }}
              value={scheduleForm.platform}
              onChange={e => setScheduleForm({ ...scheduleForm, platform: e.target.value })}>
              {['twitter', 'linkedin', 'instagram', 'facebook', 'youtube', 'tiktok', 'email', 'blog'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input type="datetime-local" className="form-input" style={{ maxWidth: 220 }}
              value={scheduleForm.publish_at}
              onChange={e => setScheduleForm({ ...scheduleForm, publish_at: e.target.value })}
              required />
            <input className="form-input" placeholder="Title"
              value={scheduleForm.title}
              onChange={e => setScheduleForm({ ...scheduleForm, title: e.target.value })} />
            <button type="submit" className="btn btn-gradient">
              <FiClock /> Schedule
            </button>
          </form>
          {schedule.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No upcoming scheduled posts in the next 14 days.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>When</th><th>Platform</th><th>Title</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {schedule.map(s => (
                  <tr key={s.id}>
                    <td>{new Date(s.publish_at).toLocaleString()}</td>
                    <td>{s.platform}</td>
                    <td>{s.title || '-'}</td>
                    <td><span className="badge badge-processing">{s.status}</span></td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => handleScheduleDelete(s.id)}>Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* New AI features */}
        <h3 style={{ marginBottom: 16 }}>NEW AI Features</h3>
        <div className="features-grid">
          {NEW_FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.id} className="feature-card" onClick={() => togglePanel(f.id)}>
                <div className="feature-card-icon"><Icon /></div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <div className="feature-card-footer">
                  <span className="feature-card-count"><strong>{activePanel === f.id ? 'Open' : 'Click'}</strong></span>
                  <span className="feature-card-arrow"><FiZap /></span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Active panel */}
        {activePanel && (() => {
          const feature = NEW_FEATURES.find(f => f.id === activePanel);
          return (
            <div className="table-container" style={{ marginTop: 24, padding: 20 }}>
              <h3 style={{ marginBottom: 12 }}>{feature.title}</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>{feature.desc}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {renderPanelInputs(feature)}
                {feature.type === 'calendar' ? (
                  <p style={{ color: 'var(--text-secondary)' }}>Use the Content Calendar above to schedule posts across platforms.</p>
                ) : (
                  <button
                    className="btn btn-gradient"
                    onClick={() => handleRun(feature)}
                    disabled={loading === feature.id}
                  >
                    {loading === feature.id ? 'Generating...' : (<><FiPlay /> Run</>)}
                  </button>
                )}
              </div>
              {results[feature.id] && (
                <AIOutput content={results[feature.id]} />
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{
      padding: '12px 16px',
      background: 'var(--bg-gray)',
      borderRadius: 'var(--radius)',
      minWidth: 140,
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default AdvancedTools;
