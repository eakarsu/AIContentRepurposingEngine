import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FiCopy, FiCheck } from 'react-icons/fi';

function AIOutput({ content }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    const textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = textContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderContent = () => {
    if (!content) {
      return (
        <div className="ai-output-empty">
          <div className="ai-output-empty-icon">&#10024;</div>
          <p>No AI-generated content yet. Click "Generate with AI" to create content.</p>
        </div>
      );
    }

    let markdownText = '';

    if (typeof content === 'string') {
      // Try parsing as JSON first
      try {
        const parsed = JSON.parse(content);
        markdownText = formatObject(parsed);
      } catch {
        markdownText = content;
      }
    } else if (typeof content === 'object') {
      markdownText = formatObject(content);
    }

    return (
      <div className="ai-output-body">
        <ReactMarkdown>{markdownText}</ReactMarkdown>
      </div>
    );
  };

  const formatObject = (obj) => {
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) {
      return obj.map((item, i) => {
        if (typeof item === 'string') return `- ${item}`;
        if (typeof item === 'object') return formatObject(item);
        return `- ${item}`;
      }).join('\n\n');
    }

    let md = '';
    for (const [key, value] of Object.entries(obj)) {
      const heading = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());

      if (typeof value === 'string') {
        md += `## ${heading}\n\n${value}\n\n`;
      } else if (Array.isArray(value)) {
        md += `## ${heading}\n\n`;
        value.forEach(item => {
          if (typeof item === 'string') {
            md += `- ${item}\n`;
          } else if (typeof item === 'object') {
            md += formatObject(item) + '\n';
          }
        });
        md += '\n';
      } else if (typeof value === 'object' && value !== null) {
        md += `## ${heading}\n\n${formatObject(value)}\n\n`;
      } else {
        md += `**${heading}:** ${value}\n\n`;
      }
    }
    return md;
  };

  return (
    <div className="ai-output-container">
      <div className="ai-output-header">
        <div className="ai-output-header-left">
          <span className="ai-output-sparkle">&#10024;</span>
          <h4>AI Generated Content</h4>
          {content && <span className="badge">Ready</span>}
        </div>
        {content && (
          <button className="btn-copy" onClick={handleCopy}>
            {copied ? <><FiCheck /> Copied!</> : <><FiCopy /> Copy</>}
          </button>
        )}
      </div>
      {renderContent()}
    </div>
  );
}

export default AIOutput;
