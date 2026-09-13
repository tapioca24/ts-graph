export interface FileNode {
  path: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
}

export interface SnapshotGraph {
  nodes: FileNode[];
  edges: DependencyEdge[];
}
