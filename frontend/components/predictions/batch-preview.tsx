import { Eye, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface BatchPreviewData {
  headers: string[];
  rows: Record<string, string>[];
}

interface BatchPreviewProps {
  preview: BatchPreviewData;
}

function BatchPreview({ preview }: BatchPreviewProps) {
  const visibleHeaders = preview.headers.slice(0, 6);
  return <div className="border-y border-line bg-surface"><div className="flex items-center gap-3 border-b border-line px-3 py-4"><Eye aria-hidden="true" className="size-4 text-signal" /><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Batch preview</p><p className="mt-1 text-sm text-ink">First {preview.rows.length} rows / {preview.headers.length} columns detected</p></div><Badge variant="neutral" className="ml-auto"><FileText aria-hidden="true" className="size-3" /> CSV</Badge></div><div className="overflow-x-auto"><table className="min-w-[42rem] w-full text-left text-xs"><thead className="border-b border-line"><tr>{visibleHeaders.map((header) => <th key={header} className="px-3 py-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{header}</th>)}</tr></thead><tbody className="divide-y divide-line">{preview.rows.map((row, index) => <tr key={`preview-${index}`}>{visibleHeaders.map((header) => <td key={`${index}-${header}`} className="max-w-32 truncate px-3 py-3 font-mono text-[10px] text-ink">{row[header] || "—"}</td>)}</tr>)}</tbody></table></div><p className="border-t border-line px-3 py-3 text-xs text-muted">Showing the first six columns for readability. The prediction request will retain the full uploaded schema.</p></div>;
}

export { BatchPreview };
