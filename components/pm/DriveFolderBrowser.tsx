"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, File, FileText, Folder, FolderOpen, Image as ImageIcon, RefreshCw, Sheet, X } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Input } from "@/components/ds/forms/Input";
import { Spinner } from "@/components/ds/core/Spinner";

/* Project folder browser — paste a Google Drive folder link once, then browse
   its contents as a tree right here (drive.readonly via /api/drive/list).
   Clicking a file opens it in Drive; folders expand lazily. */

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  modifiedTime: string;
  isFolder: boolean;
}

function iconFor(item: DriveItem) {
  const m = item.mimeType;
  if (m.includes("spreadsheet") || m.includes("excel")) return <Sheet size={13} />;
  if (m.includes("presentation") || m.includes("powerpoint")) return <FileText size={13} />;
  if (m.startsWith("image/")) return <ImageIcon size={13} />;
  if (m.includes("document") || m.includes("pdf") || m.includes("word")) return <FileText size={13} />;
  return <File size={13} />;
}

function FolderNode({
  folderId,
  depth,
  withMeta = false,
  onPath,
}: {
  folderId: string;
  depth: number;
  /** Root node also fetches the breadcrumb path. */
  withMeta?: boolean;
  onPath?: (path: { id: string; name: string }[]) => void;
}) {
  const [items, setItems] = useState<DriveItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSub, setOpenSub] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    fetch(`/api/drive/list?folder=${encodeURIComponent(folderId)}${withMeta ? "&meta=1" : ""}`)
      .then(async (res) => {
        const json = await res.json() as {error?:string;items:DriveItem[];path?:{id:string;name:string}[]};
        if (!res.ok) {
          setError(
            json.error === "no_google_token"
              ? "Sign in with Google once to browse this folder."
              : json.error ?? "Failed to load the folder.",
          );
          setItems([]);
          return;
        }
        setError(null);
        setItems(json.items as DriveItem[]);
        if (withMeta && onPath && Array.isArray(json.path)) onPath(json.path);
      })
      .catch(() => {
        setError("Failed to load the folder.");
        setItems([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, withMeta]);

  useEffect(() => {
    load();
  }, [load]);

  if (items === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", paddingLeft: depth * 16, color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
        <Spinner size="sm" /> Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: "4px 0", paddingLeft: depth * 16, color: "var(--red-600)", fontSize: "var(--text-xs)" }}>
        {error}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div style={{ padding: "4px 0", paddingLeft: depth * 16, color: "var(--text-subtle)", fontSize: "var(--text-xs)" }}>
        (empty)
      </div>
    );
  }

  return (
    <>
      {items.map((item) => {
        const expanded = openSub.has(item.id);
        return (
          <div key={item.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", paddingLeft: depth * 16, minWidth: 0 }}>
              {item.isFolder ? (
                <button
                  type="button"
                  onClick={() =>
                    setOpenSub((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", padding: 0, font: "inherit", fontSize: "var(--text-sm)", color: "var(--text-strong)", fontWeight: 500, minWidth: 0 }}
                >
                  {expanded ? <FolderOpen size={14} style={{ color: "var(--amber-500)", flexShrink: 0 }} /> : <Folder size={14} style={{ color: "var(--amber-500)", flexShrink: 0 }} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.name}>{item.name}</span>
                </button>
              ) : (
                <a
                  href={item.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", color: "var(--text-default)", textDecoration: "none", minWidth: 0 }}
                >
                  <span style={{ color: "var(--text-muted)", flexShrink: 0, display: "inline-flex" }}>{iconFor(item)}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.name}>{item.name}</span>
                  <ExternalLink size={11} style={{ color: "var(--text-subtle)", flexShrink: 0 }} />
                </a>
              )}
            </div>
            {item.isFolder && expanded && <FolderNode folderId={item.id} depth={depth + 1} />}
          </div>
        );
      })}
    </>
  );
}

export function DriveFolderBrowser({
  folderUrl,
  onChangeFolder,
}: {
  folderUrl: string;
  onChangeFolder: (url: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);

  if (!folderUrl) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <Input
          size="sm"
          placeholder="Paste a Google Drive folder link…"
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && draft.trim()) onChangeFolder(draft.trim()); }}
        />
        <Button variant="soft" size="sm" disabled={!draft.trim()} onClick={() => onChangeFolder(draft.trim())}>
          Link
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <a
          href={folderUrl.startsWith("http") ? folderUrl : `https://drive.google.com/drive/folders/${folderUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-primary)", textDecoration: "none" }}
        >
          <Folder size={14} /> {path.length ? path[path.length - 1].name : "Project folder"} <ExternalLink size={11} />
        </a>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" iconOnly aria-label="Refresh folder" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw size={13} />
        </Button>
        <Button variant="ghost" size="sm" iconOnly aria-label="Unlink folder" onClick={() => onChangeFolder("")}>
          <X size={13} />
        </Button>
      </div>
      {path.length > 1 && (
        <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={path.map((p) => p.name).join(" › ")}>
          {path.map((p) => p.name).join(" › ")}
        </div>
      )}
      <div className="sx-scroll" style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "6px 10px" }}>
        <FolderNode key={reloadKey} folderId={folderUrl} depth={0} withMeta onPath={setPath} />
      </div>
    </div>
  );
}
