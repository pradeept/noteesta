export type MaterialKey = 'notes' | 'flashcards' | 'mcqs' | 'trueFalse' | 'roadmap';

export type SourceKind = 'audio' | 'video' | 'pdf' | 'document' | 'image' | 'youtube';

export interface Citation {
  sourceId: string;
  sourceName: string;
  locator: string;
  excerpt: string;
}

export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  detail: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  originalAvailable?: boolean;
  excerpt?: string;
}

export type CollectionColor = 'moss' | 'ocean' | 'terracotta' | 'plum' | 'gold' | 'slate';

export interface Collection {
  id: string;
  name: string;
  color: CollectionColor;
  createdAt: string;
}

export interface LibraryPillReference {
  id: string;
  title: string;
}

export interface LibraryEntry {
  sourceId: string;
  name: string;
  kind: SourceKind;
  detail: string;
  originalAvailable: boolean;
  youtubeUrl?: string | null;
  pills: LibraryPillReference[];
}

export interface NoteSection {
  id: string;
  title: string;
  markdown: string;
  citations: Citation[];
}

export interface VisualSpec {
  id: string;
  title: string;
  description: string;
  kind: 'flow' | 'bar' | 'timeline';
  nodes?: Array<{ id: string; label: string; detail: string }>;
  edges?: Array<{ from: string; to: string; label: string }>;
  data?: Array<{ label: string; value: number; unit?: string }>;
  citations: Citation[];
  assetUrl?: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  citations: Citation[];
}

export interface Mcq {
  id: string;
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  citations: Citation[];
}

export interface TrueFalseQuestion {
  id: string;
  statement: string;
  answer: boolean;
  explanation: string;
  citations: Citation[];
}

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  sectionId: string;
}

export interface StudyArtifact {
  summary: string;
  sections: NoteSection[];
  visuals: VisualSpec[];
  flashcards: Flashcard[];
  mcqs: Mcq[];
  trueFalse: TrueFalseQuestion[];
  roadmap: RoadmapItem[];
}

export interface StudyPill {
  id: string;
  title: string;
  subject: string;
  description?: string | null;
  tags: string[];
  collectionId?: string | null;
  status: 'draft' | 'queued' | 'processing' | 'ready' | 'failed';
  progress: number;
  stage?: string;
  selectedMaterials: MaterialKey[];
  sources: Source[];
  artifact?: StudyArtifact;
  updatedAt: string;
  processingDurationSeconds?: number | null;
  error?: string;
  isDemo?: boolean;
}

export interface ChatAnswer {
  answer: string;
  citations: Citation[];
  grounded: boolean;
}

export interface CreatePillInput {
  title: string;
  subject: string;
  youtubeUrl?: string;
  files: File[];
  selectedMaterials: MaterialKey[];
  detailLevel: 'concise' | 'balanced' | 'detailed';
  learnerLevel: 'beginner' | 'intermediate' | 'advanced';
  targetExamDate?: string;
  studyHoursPerDay?: number;
}
