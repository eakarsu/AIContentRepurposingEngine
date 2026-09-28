import React from 'react';
import Navbar from '../components/Navbar';
import FormatPerformanceChart from '../components/FormatPerformanceChart';
import ChannelEngagementHeatmap from '../components/ChannelEngagementHeatmap';
import ContentPlanPdf from '../components/ContentPlanPdf';
import RepurposingRulesEditor from '../components/RepurposingRulesEditor';

function CustomViewsPage() {
  return (
    <div className="dashboard-page">
      <Navbar breadcrumbs={[{ label: 'Content Views', to: '/custom-views' }]} />
      <div className="dashboard-content" data-testid="custom-views-page" style={{ padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>Content Views</h2>
          <p style={{ color: '#aaa', margin: '4px 0 0 0' }}>
            Visualize recorded format performance and channel engagement, generate a content
            plan PDF, and manage the repurposing rules saved to your account.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <FormatPerformanceChart />
          <ChannelEngagementHeatmap />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
          <ContentPlanPdf />
          <RepurposingRulesEditor />
        </div>
      </div>
    </div>
  );
}

export default CustomViewsPage;
