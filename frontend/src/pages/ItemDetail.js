import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiSave, FiTrash2, FiZap, FiCalendar, FiClock } from 'react-icons/fi';
import Navbar from '../components/Navbar';
import AIOutput from '../components/AIOutput';

const FEATURE_TITLES = {
  content_library: 'Content Library',
  blog_to_social: 'Blog to Social Media',
  video_scripts: 'Video Script Generator',
  podcast_notes: 'Podcast Show Notes',
  email_newsletters: 'Email Newsletter',
  seo_optimizer: 'SEO Optimizer',
  tweet_threads: 'Tweet Thread Generator',
  linkedin_posts: 'LinkedIn Post Generator',
  instagram_captions: 'Instagram Captions',
  youtube_descriptions: 'YouTube Descriptions',
  content_summaries: 'Content Summarizer',
  headlines: 'Headline Generator',
  content_translator: 'Content Style Translator',
  ad_copy: 'Ad Copy Generator',
  press_releases: 'Press Release Generator',
};

function ItemDetail() {
  const { featureName, id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const featureTitle = FEATURE_TITLES[featureName] || featureName;
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  useEffect(() => {
    fetchItem();
  }, [featureName, id]);

  const fetchItem = async () => {
    try {
      const res = await axios.get(`/api/content/${featureName}/${id}`, { headers });
      const data = res.data.item || res.data;
      setItem(data);
      setTitle(data.title || '');
      setContent(data.content || '');
    } catch {
      toast.error('Failed to load item');
      navigate(`/feature/${featureName}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/content/${featureName}/${id}`, { title, content }, { headers });
      toast.success('Changes saved!');
      fetchItem();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!content.trim()) {
      toast.error('Please add some content before generating');
      return;
    }
    setRegenerating(true);
    try {
      // First generate AI content
      const aiRes = await axios.post('/api/ai/generate', {
        feature: featureName,
        title,
        content,
      }, { headers });

      // Then update the existing item with the AI output
      await axios.put(`/api/content/${featureName}/${id}`, {
        title,
        content,
        ai_output: aiRes.data.ai_output,
        status: 'completed',
      }, { headers });

      toast.success('AI content regenerated!');
      fetchItem();
    } catch (err) {
      const msg = err.response?.data?.error || 'Regeneration failed';
      toast.error(msg);
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`/api/content/${featureName}/${id}`, { headers });
      toast.success('Item deleted');
      navigate(`/feature/${featureName}`);
    } catch {
      toast.error('Failed to delete');
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const statusClass = (s) => {
    const status = (s || 'draft').toLowerCase();
    if (status === 'completed') return 'badge badge-completed';
    if (status === 'processing') return 'badge badge-processing';
    if (status === 'published') return 'badge badge-published';
    return 'badge badge-draft';
  };

  if (loading) {
    return (
      <div className="detail-page">
        <Navbar breadcrumbs={[
          { label: featureTitle, to: `/feature/${featureName}` },
          { label: 'Loading...' },
        ]} />
        <div className="detail-content">
          <div className="loading-container">
            <div className="spinner spinner-dark loading-large" />
            <p>Loading item...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-page">
      <Navbar breadcrumbs={[
        { label: featureTitle, to: `/feature/${featureName}` },
        { label: title || 'Item Detail' },
      ]} />
      <div className="detail-content">
        <button className="back-button" onClick={() => navigate(`/feature/${featureName}`)}>
          <FiArrowLeft /> Back to {featureTitle}
        </button>

        <div className="detail-header">
          <div className="detail-header-left">
            <input
              type="text"
              className="detail-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title..."
            />
            <div className="detail-meta">
              <span className={statusClass(item?.status)}>
                {(item?.status || 'draft').charAt(0).toUpperCase() + (item?.status || 'draft').slice(1)}
              </span>
              <span className="detail-meta-item">
                <FiCalendar /> Created: {formatDate(item?.createdAt || item?.created_at)}
              </span>
              {(item?.updatedAt || item?.updated_at) && (
                <span className="detail-meta-item">
                  <FiClock /> Updated: {formatDate(item?.updatedAt || item?.updated_at)}
                </span>
              )}
            </div>
          </div>
          <div className="detail-header-actions">
            <button className="btn btn-gradient" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? <><span className="spinner" /> Generating...</> : <><FiZap /> Regenerate with AI</>}
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : <><FiSave /> Save Changes</>}
            </button>
            <button className="btn btn-danger" onClick={() => setShowConfirm(true)}>
              <FiTrash2 /> Delete
            </button>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Original Content</div>
          <textarea
            className="detail-content-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter or paste your original content here..."
          />
        </div>

        <AIOutput content={item?.ai_output || item?.aiOutput} />
      </div>

      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog-icon">
              <FiTrash2 />
            </div>
            <h4>Delete this item?</h4>
            <p>This action cannot be undone. The item and its AI-generated content will be permanently removed.</p>
            <div className="confirm-actions">
              <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ItemDetail;
