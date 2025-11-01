-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_username TEXT UNIQUE NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_github ON users(github_username);

-- Repositories table
CREATE TABLE IF NOT EXISTS repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_repo TEXT UNIQUE NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  description TEXT,
  default_branch TEXT DEFAULT 'main',
  stars INT DEFAULT 0,
  language TEXT,
  last_indexed_at TIMESTAMPTZ,
  indexing_status TEXT DEFAULT 'idle',
  indexing_error TEXT,
  tree_sha TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repos_owner_repo ON repositories(owner_repo);

-- File tree nodes (stores metrics, layout computed on-demand)
CREATE TABLE IF NOT EXISTS file_tree_nodes (
  id TEXT PRIMARY KEY,
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  node_type TEXT NOT NULL,
  parent_node TEXT,
  
  file_size BIGINT DEFAULT 0,
  cumulative_size BIGINT DEFAULT 0,
  file_count INT DEFAULT 0,
  depth INT DEFAULT 0,
  
  language TEXT,
  extension TEXT,
  blob_sha TEXT,
  last_modified TIMESTAMPTZ,
  
  has_chunks BOOLEAN DEFAULT FALSE,
  chunk_count INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(repo_id, path)
);

CREATE INDEX IF NOT EXISTS idx_tree_repo ON file_tree_nodes(repo_id);
CREATE INDEX IF NOT EXISTS idx_tree_parent ON file_tree_nodes(parent_node);

-- Diagram presets
CREATE TABLE IF NOT EXISTS diagram_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  diagram_type TEXT NOT NULL,
  config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id, name)
);

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  favorite_repos TEXT[],
  recent_repos TEXT[],
  settings JSONB
);

