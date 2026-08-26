import { DoorOpen, FilePdf, FileXls, ImageSquare } from "@phosphor-icons/react";

type ExportKind = "xlsx" | "pdf" | "jpg" | "room-card";

const EXPORT_META = {
  xlsx: { label: "XLSX", Icon: FileXls },
  pdf: { label: "PDF", Icon: FilePdf },
  jpg: { label: "JPG", Icon: ImageSquare },
  "room-card": { label: "방 카드", Icon: DoorOpen },
} satisfies Record<ExportKind, { label: string; Icon: typeof FileXls }>;

export default function ExportButton({ kind, onClick, disabled, title, compact = true }: {
  kind: ExportKind;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  title?: string;
  compact?: boolean;
}) {
  const { label, Icon } = EXPORT_META[kind];
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      title={title}
      className={`btn-secondary export-action ${compact ? "btn-sm" : ""}`}
    >
      <Icon size={16} weight="bold" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
