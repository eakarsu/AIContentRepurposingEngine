import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './AppSidebar.css';

const LINKS = [
  { to: '/insights/timeline', label: 'Timeline', group: 'Insights' },
  { to: '/codex/custom-viz', label: 'Custom Viz', group: 'Insights' },
  { to: '/codex/operations', label: 'Operations', group: 'Insights' },
  { to: '/', label: 'Dashboard', group: 'Workspace' },
  { to: '/dashboard', label: 'Dashboard', group: 'Workspace' },
  { to: '/advanced', label: 'Advanced', group: 'Workspace' },
  { to: '/custom-views', label: 'Custom Views', group: 'Workspace' },
  { to: '/channel-fatigue', label: 'Channel Fatigue', group: 'Workspace' },
  { to: '/feature/content_library', label: 'Content_Library', group: 'Workspace' },
  { to: '/feature/blog_to_social', label: 'Blog_To_Social', group: 'Workspace' },
  { to: '/feature/video_scripts', label: 'Video_Scripts', group: 'Workspace' },
  { to: '/feature/podcast_notes', label: 'Podcast_Notes', group: 'Workspace' },
  { to: '/feature/email_newsletters', label: 'Email_Newsletters', group: 'Workspace' },
  { to: '/feature/seo_optimizer', label: 'Seo_Optimizer', group: 'Workspace' },
  { to: '/feature/tweet_threads', label: 'Tweet_Threads', group: 'Workspace' },
  { to: '/feature/linkedin_posts', label: 'Linkedin_Posts', group: 'Workspace' },
  { to: '/feature/instagram_captions', label: 'Instagram_Captions', group: 'Workspace' },
  { to: '/feature/youtube_descriptions', label: 'Youtube_Descriptions', group: 'Workspace' },
  { to: '/feature/content_summaries', label: 'Content_Summaries', group: 'Workspace' },
  { to: '/feature/headlines', label: 'Headline Generator', group: 'Workspace' },
  { to: '/feature/content_translator', label: 'Content_Translator', group: 'Workspace' },
  { to: '/feature/ad_copy', label: 'Ad_Copy', group: 'Workspace' },
  { to: '/feature/press_releases', label: 'Press_Releases', group: 'Workspace' },
];

export default function AppSidebar() {
  const [query, setQuery] = useState('');
  const visible = LINKS.filter(link => link.label.toLowerCase().includes(query.toLowerCase().trim()));
  return <aside className="codex-side" aria-label="Application navigation">
    <div className="codex-side-brand"><strong>AIContent Repurposing Engine</strong><span>Workspace</span></div>
    <label className="codex-side-search-label" htmlFor="codex-side-search">Find a section</label>
    <input id="codex-side-search" className="codex-side-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search navigation" />
    <nav className="codex-side-links" aria-label="Sections">
      {['Workspace', 'AI tools', 'Insights'].map(group => {
        const items = visible.filter(link => link.group === group);
        return items.length ? <div className="codex-side-group" key={group}>
          <span className="codex-side-heading">{group}</span>
          {items.map(link => <NavLink key={link.to} to={link.to} end={link.to === '/'} className={({ isActive }) => `codex-side-link${isActive ? ' active' : ''}`}>{link.label}</NavLink>)}
        </div> : null;
      })}
      {visible.length === 0 && <p className="codex-side-empty">No matching sections</p>}
    </nav>
  </aside>;
}
