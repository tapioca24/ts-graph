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

export type NodeStatus = "unchanged" | "added" | "modified" | "deleted";
export type EdgeStatus = "unchanged" | "added" | "deleted";

export interface DiffNode extends FileNode {
  status: NodeStatus;
}

export interface DiffEdge extends DependencyEdge {
  status: EdgeStatus;
}

export interface DiffRename extends DependencyEdge {
  status: "renamed";
}

export interface DiffGraph {
  nodes: DiffNode[];
  edges: DiffEdge[];
  renames: DiffRename[];
}

/** Render this separately from file nodes; it has no repository path. */
export interface OmittedSummary {
  count: number;
  label: string;
}

export interface SelectedGraph extends DiffGraph {
  omitted?: OmittedSummary;
}
