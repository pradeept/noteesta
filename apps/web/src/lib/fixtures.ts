import type { Citation, StudyPill } from '@/lib/types';

export const demoThreeDJavaScript = `function buildArtifact(THREE, scene) {
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(2, 40, 28),
    new THREE.MeshPhongMaterial({ color: 0x82a766, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
  );
  shell.scale.set(1.35, 0.68, 0.78);
  scene.add(shell);
  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(1.96, 40, 28),
    new THREE.MeshPhongMaterial({ color: 0xb5ce89, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
  );
  inner.scale.set(1.35, 0.68, 0.78);
  scene.add(inner);
  const material = new THREE.MeshStandardMaterial({ color: 0x426c42, roughness: 0.58, metalness: 0.05 });
  for (const x of [-1.25, 0, 1.25]) {
    for (let layer = 0; layer < 6; layer++) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.075, 28), material);
      disc.position.set(x, -0.29 + layer * 0.12, x === 0 ? 0.2 : -0.08);
      scene.add(disc);
    }
  }
  return {
    cameraPosition: [4.5, 2.7, 6.4],
    labels: [
      { text: 'Thylakoid stacks', position: [0, 0.65, 0.2] },
      { text: 'Stroma', position: [1.35, -0.7, 0.45] }
    ]
  };
}`;

const lectureCitation: Citation = {
  sourceId: 'lecture-04',
  sourceName: 'Lecture 04: Photosynthesis',
  locator: '08:42',
  excerpt:
    'The light-dependent reactions take place in the thylakoid membrane. They supply ATP and NADPH to the Calvin cycle.',
};

const slidesCitation: Citation = {
  sourceId: 'photosynthesis-slides',
  sourceName: 'Photosynthesis slides.pdf',
  locator: 'page 6',
  excerpt:
    'The Calvin cycle takes place in the stroma and uses ATP and NADPH to fix carbon dioxide into G3P.',
};

const notesCitation: Citation = {
  sourceId: 'handwritten-notes',
  sourceName: 'My handwritten notes.jpg',
  locator: 'page 1',
  excerpt:
    'Remember: light reactions happen in the thylakoid; the Calvin cycle happens in the stroma.',
};

export const demoPill: StudyPill = {
  id: 'demo-photosynthesis',
  title: 'Photosynthesis, made clear',
  subject: 'Biology',
  description: 'A gentle guide to how plants capture and use light energy.',
  tags: ['plants', 'energy'],
  collectionId: undefined,
  status: 'ready',
  progress: 100,
  selectedMaterials: ['notes', 'flashcards', 'mcqs', 'trueFalse', 'roadmap', 'threeD'],
  updatedAt: '2026-10-03T08:30:00.000Z',
  processingDurationSeconds: 94,
  isDemo: true,
  sources: [
    {
      id: lectureCitation.sourceId,
      name: lectureCitation.sourceName,
      kind: 'audio',
      detail: '28 min class recording',
      status: 'ready',
      excerpt: lectureCitation.excerpt,
    },
    {
      id: slidesCitation.sourceId,
      name: slidesCitation.sourceName,
      kind: 'pdf',
      detail: '12 pages',
      status: 'ready',
      excerpt: slidesCitation.excerpt,
    },
    {
      id: notesCitation.sourceId,
      name: notesCitation.sourceName,
      kind: 'image',
      detail: '1 handwritten page',
      status: 'ready',
      excerpt: notesCitation.excerpt,
    },
  ],
  artifact: {
    summary:
      'Plants convert light energy into chemical energy. Light reactions capture energy, then the Calvin cycle uses it to build carbon compounds.',
    sections: [
      {
        id: 'overview',
        title: 'First, the bigger picture',
        markdown:
          'Photosynthesis takes place in **chloroplasts**. Inside each chloroplast, stacks of membrane sacs called **thylakoids** are surrounded by a fluid called the **stroma**. Each stage has its own workspace.\n\nThink of the light reactions as charging a battery. The Calvin cycle spends that stored energy to turn carbon dioxide into useful carbon compounds.',
        citations: [lectureCitation, slidesCitation],
      },
      {
        id: 'connection',
        title: 'How the two stages connect',
        markdown:
          'Light and water enter the light-dependent reactions, releasing oxygen. **ATP and NADPH** carry energy to the Calvin cycle, where carbon dioxide is used to produce G3P. ADP and NADP+ return to the light reactions.',
        citations: [lectureCitation, slidesCitation],
      },
      {
        id: 'remember',
        title: 'What to remember',
        markdown:
          '- The oxygen released comes from **water**, not carbon dioxide.\n- Light-independent does not mean only at night. The Calvin cycle depends on products of the light reactions.\n- G3P is a building block for sugars.',
        citations: [lectureCitation, notesCitation],
      },
    ],
    visuals: [
      {
        id: 'energy-flow',
        title: 'Energy flow through photosynthesis',
        description:
          'Light and water enter the light reactions. ATP and NADPH move to the Calvin cycle, while ADP and NADP+ return.',
        kind: 'flow',
        nodes: [
          { id: 'light', label: 'Light reactions', detail: 'Thylakoid membrane' },
          { id: 'calvin', label: 'Calvin cycle', detail: 'Stroma' },
        ],
        edges: [
          { from: 'light', to: 'calvin', label: 'ATP + NADPH' },
          { from: 'calvin', to: 'light', label: 'ADP + NADP+' },
        ],
        citations: [lectureCitation, slidesCitation],
      },
    ],
    flashcards: [
      {
        id: 'fc-1',
        front: 'Where do the light-dependent reactions happen?',
        back: 'In the thylakoid membrane of the chloroplast.',
        citations: [lectureCitation],
      },
      {
        id: 'fc-2',
        front: 'What supplies energy to the Calvin cycle?',
        back: 'ATP and NADPH from the light-dependent reactions.',
        citations: [lectureCitation, slidesCitation],
      },
      {
        id: 'fc-3',
        front: 'Where does the released oxygen come from?',
        back: 'Water split during the light-dependent reactions.',
        citations: [lectureCitation],
      },
    ],
    mcqs: [
      {
        id: 'mcq-1',
        question: 'Which molecules carry energy from the light reactions to the Calvin cycle?',
        choices: ['Oxygen and carbon dioxide', 'ATP and NADPH', 'Glucose and water'],
        correctIndex: 1,
        explanation: 'ATP and NADPH connect energy capture to carbon fixation.',
        citations: [lectureCitation, slidesCitation],
      },
    ],
    trueFalse: [
      {
        id: 'tf-1',
        statement: 'The oxygen released during photosynthesis comes from carbon dioxide.',
        answer: false,
        explanation: 'The released oxygen comes from water split during the light reactions.',
        citations: [lectureCitation],
      },
    ],
    roadmap: [
      {
        id: 'roadmap-1',
        title: 'See the whole process',
        description: 'Read the overview and name the two locations.',
        sectionId: 'overview',
      },
      {
        id: 'roadmap-2',
        title: 'Follow the energy',
        description: 'Trace ATP and NADPH through the visual.',
        sectionId: 'connection',
      },
      {
        id: 'roadmap-3',
        title: 'Recall it unaided',
        description: 'Explain both stages, then try the practice questions.',
        sectionId: 'remember',
      },
    ],
    threeD: {
      status: 'ready',
      title: 'Inside a chloroplast',
      description:
        'A schematic chloroplast showing thylakoid stacks surrounded by stroma. Shape, color, and scale are illustrative.',
      citations: [lectureCitation, slidesCitation],
    },
  },
};
