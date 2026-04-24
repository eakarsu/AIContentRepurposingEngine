import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiPlus, FiTrash2 } from 'react-icons/fi';
import Navbar from '../components/Navbar';
import CreateModal from '../components/CreateModal';

const FEATURE_INFO = {
  content_library: { title: 'Content Library', desc: 'Store and manage your original content pieces' },
  blog_to_social: { title: 'Blog to Social Media', desc: 'Transform blog posts into engaging social media content' },
  video_scripts: { title: 'Video Script Generator', desc: 'Create compelling video scripts from any content' },
  podcast_notes: { title: 'Podcast Show Notes', desc: 'Generate detailed podcast show notes automatically' },
  email_newsletters: { title: 'Email Newsletter', desc: 'Create engaging email newsletters from your content' },
  seo_optimizer: { title: 'SEO Optimizer', desc: 'Optimize your content for search engines' },
  tweet_threads: { title: 'Tweet Thread Generator', desc: 'Create viral Twitter/X threads from your content' },
  linkedin_posts: { title: 'LinkedIn Post Generator', desc: 'Craft professional LinkedIn posts that engage' },
  instagram_captions: { title: 'Instagram Captions', desc: 'Generate Instagram captions with emojis and hashtags' },
  youtube_descriptions: { title: 'YouTube Descriptions', desc: 'Create SEO-optimized YouTube video descriptions' },
  content_summaries: { title: 'Content Summarizer', desc: 'Summarize long content into key takeaways' },
  headlines: { title: 'Headline Generator', desc: 'Generate compelling headlines using proven formulas' },
  content_translator: { title: 'Content Style Translator', desc: 'Translate content between different writing styles' },
  ad_copy: { title: 'Ad Copy Generator', desc: 'Create high-converting ad copy for any platform' },
  press_releases: { title: 'Press Release Generator', desc: 'Transform news into professional press releases' },
};

function FeaturePage() {
  const { featureName } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const info = FEATURE_INFO[featureName] || { title: featureName, desc: '' };
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const fetchItems = useCallback(async () => {
    try {
      const res = await axios.get(`/api/content/${featureName}`, { headers });
      const data = res.data;
      setItems(Array.isArray(data) ? data : (data.items || []));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [featureName]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await axios.delete(`/api/content/${featureName}/${id}`, { headers });
      toast.success('Item deleted');
      fetchItems();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const statusClass = (s) => {
    const status = (s || 'draft').toLowerCase();
    if (status === 'completed') return 'badge badge-completed';
    if (status === 'processing') return 'badge badge-processing';
    if (status === 'published') return 'badge badge-published';
    return 'badge badge-draft';
  };

  return (
    <div className="feature-page">
      <Navbar breadcrumbs={[{ label: info.title }]} />
      <div className="feature-content">
        <div className="feature-header">
          <div className="feature-header-left">
            <button className="back-button" onClick={() => navigate('/dashboard')}>
              <FiArrowLeft /> Back to Dashboard
            </button>
            <h2>{info.title}</h2>
            <p>{info.desc}</p>
          </div>
          <button className="btn btn-gradient" onClick={() => setShowModal(true)}>
            <FiPlus /> Create New
          </button>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner spinner-dark loading-large" />
            <p>Loading items...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="table-container">
            <div className="empty-state">
              <div className="empty-state-icon">&#128196;</div>
              <h3>No items yet</h3>
              <p>Create your first {info.title.toLowerCase()} item to get started.</p>
              <button className="btn btn-gradient" onClick={() => setShowModal(true)}>
                <FiPlus /> Create New
              </button>
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item._id || item.id} onClick={() => navigate(`/feature/${featureName}/${item._id || item.id}`)}>
                    <td className="table-title">{item.title || 'Untitled'}</td>
                    <td>
                      <span className={statusClass(item.status)}>
                        {(item.status || 'draft').charAt(0).toUpperCase() + (item.status || 'draft').slice(1)}
                      </span>
                    </td>
                    <td className="table-date">{formatDate(item.createdAt || item.created_at)}</td>
                    <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn-icon btn-icon-danger" onClick={(e) => handleDelete(e, item._id || item.id)} title="Delete">
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <CreateModal
          featureName={featureName}
          onClose={() => setShowModal(false)}
          onCreated={fetchItems}
        />
      )}
    </div>
  );
}

export default FeaturePage;
