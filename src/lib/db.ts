import Database from "@tauri-apps/plugin-sql";

export type PostStatus = "draft" | "queued" | "published";

export interface Post {
  id?: number;
  title: string;
  body: string;
  platform: string;
  status: PostStatus;
  scheduled_at?: string | null;
  created_at?: string;
}

export interface Asset {
  id?: number;
  name: string;
  path: string;
  mime_type: string;
  created_at?: string;
}

let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load("sqlite:dosh.db");
  await migrate(_db);
  return _db;
}

async function migrate(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      body        TEXT    NOT NULL,
      platform    TEXT    NOT NULL DEFAULT '',
      status      TEXT    NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS assets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      path       TEXT NOT NULL UNIQUE,
      mime_type  TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function savePost(post: Post): Promise<Post> {
  const db = await getDb();

  if (post.id) {
    await db.execute(
      `UPDATE posts SET title=?, body=?, platform=?, status=?, scheduled_at=?
       WHERE id=?`,
      [post.title, post.body, post.platform, post.status, post.scheduled_at ?? null, post.id],
    );
    return post;
  }

  const result = await db.execute(
    `INSERT INTO posts (title, body, platform, status, scheduled_at)
     VALUES (?, ?, ?, ?, ?)`,
    [post.title, post.body, post.platform, post.status, post.scheduled_at ?? null],
  );

  return { ...post, id: result.lastInsertId as number };
}

export async function getPosts(status?: PostStatus): Promise<Post[]> {
  const db = await getDb();
  if (status) {
    return db.select<Post[]>("SELECT * FROM posts WHERE status=? ORDER BY created_at DESC", [status]);
  }
  return db.select<Post[]>("SELECT * FROM posts ORDER BY created_at DESC");
}

export async function deletePost(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM posts WHERE id=?", [id]);
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export async function saveAsset(asset: Asset): Promise<Asset> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT OR REPLACE INTO assets (name, path, mime_type) VALUES (?, ?, ?)`,
    [asset.name, asset.path, asset.mime_type],
  );
  return { ...asset, id: result.lastInsertId as number };
}

export async function getAssets(): Promise<Asset[]> {
  const db = await getDb();
  return db.select<Asset[]>("SELECT * FROM assets ORDER BY created_at DESC");
}

export async function deleteAsset(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM assets WHERE id=?", [id]);
}
