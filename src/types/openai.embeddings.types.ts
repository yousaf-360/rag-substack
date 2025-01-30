export type Chunk = {
  start: number;
  end: number;
  chunk: string;
};

export type Metadata = {
  start: number;
  end: number;
  link: string;
};
export type Embedding = {
  content: string;
  metadata: Metadata;
  embeddings: number[];
};
