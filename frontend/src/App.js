import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import FeaturePage from './pages/FeaturePage';
import ItemDetail from './pages/ItemDetail';
import AdvancedTools from './pages/AdvancedTools';

// // === Batch 02 Gaps & Frontend Mounts ===
import CfAgenticContentExpansion from './pages/CfAgenticContentExpansion';
import CfRealTimeTrendDetectionContentSuggestion from './pages/CfRealTimeTrendDetectionContentSuggestion';
import CfEngagementPrediction from './pages/CfEngagementPrediction';
import CfSeoOptimizationLoop from './pages/CfSeoOptimizationLoop';
import CfMultiLingualContentAdaptation from './pages/CfMultiLingualContentAdaptation';
import GapScheduleAnalyticsLackAiEndpointsForOptimalPostingTim from './pages/GapScheduleAnalyticsLackAiEndpointsForOptimalPostingTim';
import GapMissingExtractKeyPointsGenerateThumbnailSuggestHashta from './pages/GapMissingExtractKeyPointsGenerateThumbnailSuggestHashta';
import GapLimitedMultiChannelPublishingIntegrationsNoTwitterLin from './pages/GapLimitedMultiChannelPublishingIntegrationsNoTwitterLin';
import GapNoContentApprovalWorkflow from './pages/GapNoContentApprovalWorkflow';
import GapNoAudienceSegmentationOrPersonalization from './pages/GapNoAudienceSegmentationOrPersonalization';
import GapNoABTestingOrVariantManagement from './pages/GapNoABTestingOrVariantManagement';
import GapNoWebhooks from './pages/GapNoWebhooks';
import CustomViewsPage from './pages/CustomViewsPage';

import CodexCustomVizFeature from './pages/CodexCustomVizFeature';
import CodexOperationsFeature from './pages/CodexOperationsFeature';

import TimelineView from './pages/TimelineView';
import ChannelFatiguePage from './pages/ChannelFatiguePage';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/" replace />;
}

function App() {
  return (
    <div className="App">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1a1a2e',
            color: '#fff',
            borderRadius: '12px',
            border: '1px solid rgba(108, 99, 255, 0.3)',
          },
          success: {
            iconTheme: { primary: '#00d2ff', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ff6b6b', secondary: '#fff' },
          },
        }}
      />
      <Routes>
        <Route path="/insights/timeline" element={<TimelineView />} />
        <Route path="/codex/custom-viz" element={<CodexCustomVizFeature />} />
        <Route path="/codex/operations" element={<CodexOperationsFeature />} />

        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/advanced" element={<PrivateRoute><AdvancedTools /></PrivateRoute>} />
        <Route path="/feature/:featureName" element={<PrivateRoute><FeaturePage /></PrivateRoute>} />
        <Route path="/feature/:featureName/:id" element={<PrivateRoute><ItemDetail /></PrivateRoute>} />
      
        {/* // === Batch 02 Gaps & Frontend Mounts === */}
        <Route path="/cf/agentic-content-expansion" element={<CfAgenticContentExpansion />} />
        <Route path="/cf/real-time-trend-detection-content-suggestion" element={<CfRealTimeTrendDetectionContentSuggestion />} />
        <Route path="/cf/engagement-prediction" element={<CfEngagementPrediction />} />
        <Route path="/cf/seo-optimization-loop" element={<CfSeoOptimizationLoop />} />
        <Route path="/cf/multi-lingual-content-adaptation" element={<CfMultiLingualContentAdaptation />} />
        <Route path="/gap/schedule-analytics-lack-ai-endpoints-for-optimal-posting-tim" element={<GapScheduleAnalyticsLackAiEndpointsForOptimalPostingTim />} />
        <Route path="/gap/missing-extract-key-points-generate-thumbnail-suggest-hashta" element={<GapMissingExtractKeyPointsGenerateThumbnailSuggestHashta />} />
        <Route path="/gap/limited-multi-channel-publishing-integrations-no-twitter-lin" element={<GapLimitedMultiChannelPublishingIntegrationsNoTwitterLin />} />
        <Route path="/gap/no-content-approval-workflow" element={<GapNoContentApprovalWorkflow />} />
        <Route path="/gap/no-audience-segmentation-or-personalization" element={<GapNoAudienceSegmentationOrPersonalization />} />
        <Route path="/gap/no-a-b-testing-or-variant-management" element={<GapNoABTestingOrVariantManagement />} />
        <Route path="/gap/no-webhooks" element={<GapNoWebhooks />} />
        <Route path="/custom-views" element={<PrivateRoute><CustomViewsPage /></PrivateRoute>} />
        <Route path="/channel-fatigue" element={<PrivateRoute><ChannelFatiguePage /></PrivateRoute>} />
      </Routes>
    </div>
  );
}

export default App;
