import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FiDatabase, FiShare2, FiVideo, FiMic, FiMail,
  FiSearch, FiTwitter, FiBriefcase, FiCamera, FiYoutube,
  FiFileText, FiType, FiGlobe, FiDollarSign, FiBookOpen,
  FiArrowRight
} from 'react-icons/fi';
import Navbar from '../components/Navbar';

const FEATURES = [
  { key: 'content_library', title: 'Content Library', desc: 'Store and manage your original content pieces', icon: FiDatabase },
  { key: 'blog_to_social', title: 'Blog to Social Media', desc: 'Transform blog posts into engaging social media content', icon: FiShare2 },
  { key: 'video_scripts', title: 'Video Script Generator', desc: 'Create compelling video scripts from any content', icon: FiVideo },
  { key: 'podcast_notes', title: 'Podcast Show Notes', desc: 'Generate detailed podcast show notes automatically', icon: FiMic },
  { key: 'email_newsletters', title: 'Email Newsletter', desc: 'Create engaging email newsletters from your content', icon: FiMail },
  { key: 'seo_optimizer', title: 'SEO Optimizer', desc: 'Optimize your content for search engines', icon: FiSearch },
  { key: 'tweet_threads', title: 'Tweet Thread Generator', desc: 'Create viral Twitter/X threads from your content', icon: FiTwitter },
  { key: 'linkedin_posts', title: 'LinkedIn Post Generator', desc: 'Craft professional LinkedIn posts that engage', icon: FiBriefcase },
  { key: 'instagram_captions', title: 'Instagram Captions', desc: 'Generate Instagram captions with emojis and hashtags', icon: FiCamera },
  { key: 'youtube_descriptions', title: 'YouTube Descriptions', desc: 'Create SEO-optimized YouTube video descriptions', icon: FiYoutube },
  { key: 'content_summaries', title: 'Content Summarizer', desc: 'Summarize long content into key takeaways', icon: FiFileText },
  { key: 'headlines', title: 'Headline Generator', desc: 'Generate compelling headlines using proven formulas', icon: FiType },
  { key: 'content_translator', title: 'Content Style Translator', desc: 'Translate content between different writing styles', icon: FiGlobe },
  { key: 'ad_copy', title: 'Ad Copy Generator', desc: 'Create high-converting ad copy for any platform', icon: FiDollarSign },
  { key: 'press_releases', title: 'Press Release Generator', desc: 'Transform news into professional press releases', icon: FiBookOpen },
];

function Dashboard() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    FEATURES.forEach(f => {
      axios.get(`/api/content/${f.key}`, { headers })
        .then(res => {
          const data = res.data;
          const count = data.total != null ? data.total : (Array.isArray(data) ? data.length : (data.items ? data.items.length : 0));
          setCounts(prev => ({ ...prev, [f.key]: count }));
        })
        .catch(() => {
          setCounts(prev => ({ ...prev, [f.key]: 0 }));
        });
    });
  }, []);

  return (
    <div className="dashboard-page">
      <Navbar />
      <div className="dashboard-content">
        <div className="dashboard-header">
          <h2>Content Dashboard</h2>
          <p>Choose a tool to repurpose your content with AI</p>
        </div>
        <div className="features-grid">
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div
                key={f.key}
                className="feature-card"
                onClick={() => navigate(`/feature/${f.key}`)}
              >
                <div className="feature-card-icon">
                  <Icon />
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <div className="feature-card-footer">
                  <span className="feature-card-count">
                    <strong>{counts[f.key] ?? '...'}</strong> items
                  </span>
                  <span className="feature-card-arrow">
                    <FiArrowRight />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
