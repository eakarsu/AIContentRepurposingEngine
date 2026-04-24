import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiX, FiZap, FiSave } from 'react-icons/fi';

function CreateModal({ featureName, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const headers = {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };

  const featureLabel = featureName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  const handleSaveDraft = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`/api/content/${featureName}`, { title, content, status: 'draft' }, { headers });
      toast.success('Draft saved!');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title first');
      return;
    }
    setAiLoading(true);
    try {
      await axios.post('/api/ai/generate-and-save', {
        feature: featureName,
        title,
        content,
      }, { headers });
      toast.success('AI content generated!');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'AI generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create New {featureLabel}</h3>
          <button className="modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter a title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Content</label>
            <textarea
              className="form-textarea"
              placeholder="Paste your original content here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-outline" onClick={handleSaveDraft} disabled={loading}>
            {loading ? <span className="spinner spinner-dark" /> : <><FiSave /> Save as Draft</>}
          </button>
          <button className="btn btn-gradient" onClick={handleGenerateAI} disabled={aiLoading}>
            {aiLoading ? <><span className="spinner" /> Generating...</> : <><FiZap /> Generate with AI</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateModal;
