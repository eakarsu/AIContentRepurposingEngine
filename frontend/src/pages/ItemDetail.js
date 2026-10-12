import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ContentRecordDialog from '../components/ContentRecordDialog';

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

export default function ItemDetail() {
  const { featureName, id } = useParams(); const navigate = useNavigate();
  const title = FEATURE_TITLES[featureName] || featureName;
  return <div className="detail-page"><Navbar breadcrumbs={[{ label: title, to: `/feature/${featureName}` }, { label: 'Content record' }]}/><ContentRecordDialog key={`${featureName}/${id}`} featureName={featureName} itemId={id} onClose={() => navigate(`/feature/${featureName}`)}/></div>;
}
