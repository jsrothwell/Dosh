import { useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import { savePost, type Post, type PostStatus } from "../lib/db";

interface PostEditorProps {
  initial?: Post;
  onSaved?: (post: Post) => void;
  onCancel?: () => void;
}

const PLATFORMS = ["Twitter / X", "Instagram", "LinkedIn", "Mastodon", "Bluesky"];

export default function PostEditor({ initial, onSaved, onCancel }: PostEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [platform, setPlatform] = useState(initial?.platform ?? PLATFORMS[0]);
  const [status, setStatus] = useState<PostStatus>(initial?.status ?? "draft");
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduled_at ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charLimit = 280;
  const overLimit = body.length > charLimit;

  async function handleSave() {
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await savePost({
        ...initial,
        title,
        body,
        platform,
        status,
        scheduled_at: scheduledAt || null,
      });
      onSaved?.(saved);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Post title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700
                     bg-white dark:bg-neutral-900 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border border-neutral-200 dark:border-neutral-700
                     bg-white dark:bg-neutral-900 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {PLATFORMS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as PostStatus)}
          className="rounded-lg border border-neutral-200 dark:border-neutral-700
                     bg-white dark:bg-neutral-900 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="draft">Draft</option>
          <option value="queued">Queued</option>
          <option value="published">Published</option>
        </select>
      </div>

      {/* Markdown editor */}
      <div className="flex-1 min-h-0" data-color-mode="auto">
        <MDEditor
          value={body}
          onChange={(v) => setBody(v ?? "")}
          height="100%"
          preview="live"
          className="!h-full rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700"
        />
      </div>

      {/* Footer row */}
      <div className="flex items-center gap-3">
        {status === "queued" && (
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700
                       bg-white dark:bg-neutral-900 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}

        <span className={`ml-auto text-xs tabular-nums ${overLimit ? "text-red-500" : "text-neutral-400"}`}>
          {body.length} / {charLimit}
        </span>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm border border-neutral-200 dark:border-neutral-700
                       hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
        )}

        <button
          onClick={handleSave}
          disabled={saving || overLimit}
          className="rounded-lg px-4 py-2 text-sm bg-indigo-600 text-white font-medium
                     hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {saving ? "Saving…" : "Save Post"}
        </button>
      </div>
    </div>
  );
}
