import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import PostEditor from "./components/PostEditor";
import { Settings } from "./components/Settings";
import { getPosts, getAssets, saveAsset, deletePost, deleteAsset, type Post, type Asset } from "./lib/db";

type Section = "drafts" | "queue" | "assets" | "settings";

// ─── Theme hook ───────────────────────────────────────────────────────────────

function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("dosh-theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("dosh-theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: "drafts", label: "Drafts", icon: "✏️" },
  { id: "queue",  label: "Queue",  icon: "📅" },
  { id: "assets", label: "Assets", icon: "🖼️" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { dark, toggle } = useTheme();
  const [section, setSection] = useState<Section>("drafts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [editing, setEditing] = useState<Post | null | "new">(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    const status = section === "drafts" ? "draft" : section === "queue" ? "queued" : undefined;
    if (section !== "assets") setPosts(await getPosts(status));
  }, [section]);

  const loadAssets = useCallback(async () => {
    if (section === "assets") setAssets(await getAssets());
  }, [section]);

  useEffect(() => {
    loadPosts();
    loadAssets();
  }, [loadPosts, loadAssets]);

  // ── Asset import ────────────────────────────────────────────────────────────

  async function handleImportAsset() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Media", extensions: ["png", "jpg", "jpeg", "gif", "webp", "mp4", "mov", "heic"] }],
    });
    if (!selected || typeof selected !== "string") return;

    const name = selected.split("/").pop() ?? selected;
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const mime = ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime" : `image/${ext}`;

    await saveAsset({ name, path: selected, mime_type: mime });
    await loadAssets();
  }

  async function handlePreviewAsset(asset: Asset) {
    try {
      const dataUri: string = await invoke("read_media_file", { path: asset.path });
      setPreviewUrl(dataUri);
    } catch (e) {
      console.error("Preview failed:", e);
    }
  }

  // ── Post actions ────────────────────────────────────────────────────────────

  async function handleDeletePost(id: number) {
    await deletePost(id);
    await loadPosts();
  }

  async function handleDeleteAsset(id: number) {
    await deleteAsset(id);
    await loadAssets();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-sans">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <span className="text-xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">Dosh</span>
          <p className="text-xs text-neutral-400 mt-0.5">Social Media Manager</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-1">
          {NAV.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => { setSection(id); setEditing(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${section === id
                  ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {/* Theme toggle */}
        <div className="px-4 py-4 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={toggle}
            className="w-full flex items-center justify-between text-xs text-neutral-500 hover:text-neutral-800
                       dark:hover:text-neutral-200 transition-colors"
          >
            <span>{dark ? "Dark mode" : "Light mode"}</span>
            <span>{dark ? "🌙" : "☀️"}</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <header className="flex items-center justify-between px-6 py-4
                           border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <h1 className="text-base font-semibold capitalize">{section}</h1>
          {section !== "assets" && section !== "settings" && (
            <button
              onClick={() => setEditing("new")}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 text-white text-sm
                         font-medium px-3 py-1.5 hover:bg-indigo-700 transition-colors"
            >
              + New Post
            </button>
          )}
          {section === "assets" && (
            <button
              onClick={handleImportAsset}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 text-white text-sm
                         font-medium px-3 py-1.5 hover:bg-indigo-700 transition-colors"
            >
              + Import
            </button>
          )}
        </header>

        <div className="flex-1 overflow-auto">
          {section === "settings" ? (
            <Settings />
          ) : editing !== null && section !== "assets" ? (
            <div className="h-full p-6">
              <PostEditor
                initial={editing === "new" ? undefined : editing}
                onSaved={async () => { await loadPosts(); setEditing(null); }}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : section !== "assets" ? (
            /* ── Post list ──────────────────────────────────────────────── */
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {posts.length === 0 && (
                <li className="px-6 py-12 text-center text-sm text-neutral-400">
                  No {section} yet — create your first post.
                </li>
              )}
              {posts.map((post) => (
                <li key={post.id} className="px-6 py-4 flex items-start gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{post.title}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">{post.platform}</p>
                    {post.scheduled_at && (
                      <p className="text-xs text-indigo-500 mt-0.5">🗓 {new Date(post.scheduled_at).toLocaleString()}</p>
                    )}
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditing(post)}
                      className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700
                                 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => post.id && handleDeletePost(post.id)}
                      className="text-xs px-2 py-1 rounded border border-red-200 dark:border-red-900
                                 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            /* ── Assets grid ────────────────────────────────────────────── */
            <div className="p-6">
              {assets.length === 0 && (
                <p className="text-center text-sm text-neutral-400 py-12">
                  No assets yet — import screenshots or videos.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="group relative aspect-square rounded-xl overflow-hidden border
                               border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800
                               cursor-pointer"
                    onClick={() => handlePreviewAsset(asset)}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                      <span className="text-3xl">{asset.mime_type.startsWith("video") ? "🎬" : "🖼️"}</span>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 truncate w-full text-center">
                        {asset.name}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); asset.id && handleDeleteAsset(asset.id); }}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity
                                 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Media preview lightbox ────────────────────────────────────────────── */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setPreviewUrl(null)}
        >
          {previewUrl.startsWith("data:video") ? (
            <video
              src={previewUrl}
              controls
              autoPlay
              className="max-h-full max-w-full rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-full max-w-full rounded-xl shadow-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}
