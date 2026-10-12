import React from 'react';
import AIResultView from './AIResultView';
import './NativeContentUI.css';

export default function AIOutput({ content }) {
  if (content === null || content === undefined) return <div className="ai-output-empty"><p>No AI draft yet. Fill the source fields and choose Generate with OpenRouter.</p></div>;
  return <div className="native-content-ui"><AIResultView result={content} title="AI draft"/></div>;
}
