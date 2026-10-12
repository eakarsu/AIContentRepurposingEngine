export const contentFields = (feature) => [
  { key: 'title', label: 'Title', type: 'text', required: true, maxLength: 500 },
  { key: 'content', label: 'Source content', type: 'textarea', required: true },
  ...(feature === 'content_library' ? [{ key: 'category', label: 'Category', type: 'text', maxLength: 100 }] : []),
];

export const contentExamples = [
  { label: 'Editorial brief', values: { title: 'A practical guide to clearer team communication', content: 'Source notes for an illustrative editorial draft: write a short agenda before each meeting, record decisions and owners, and share a written recap. Explain how these steps help a team organize its work. The source provides no measured performance results or quotes; omit those. Invite readers to choose one practice to try.', category: 'Team communication' } },
  { label: 'Product education', values: { title: 'Explain a reusable project planning checklist', content: 'Illustrative source content: a project planning checklist covers the intended outcome, scope, milestones, responsibilities, open questions, and review dates. Describe those sections in plain language for a new project owner. Include practical questions to ask at kickoff. Do not invent product capabilities, customer testimonials, prices, links, or statistics.', category: 'Product education' } },
  { label: 'Audience engagement', values: { title: 'Turn an evidence review guide into useful audience content', content: 'Illustrative source content: before sharing a recommendation, check who produced the evidence, when it was collected, whether it addresses the question, and what uncertainty remains. Explain the steps with a clearly hypothetical planning example. End by inviting the audience to identify a question they would verify. Keep unknown facts as explicit gaps.', category: 'Evidence review' } },
];
