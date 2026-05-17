import type { Document } from "zerithdb-core";

export type BackupSnapshot = {
  format: "zerithdb.local-backup.v1";
  appId: string;
  generatedAt: string;
  collections: Record<string, Document<Record<string, unknown>>[]>;
};

export type BackupExportOptions = {
  collections?: string[];
};

export type BackupUploadInput = {
  fileName: string;
  content: string;
  contentType: "application/json";
  snapshot: BackupSnapshot;
};

export type BackupUploadResult = {
  provider: string;
  fileName: string;
  uploadedAt: string;
  location?: string;
  metadata?: unknown;
};

export interface CloudBackupTarget {
  readonly provider: string;
  uploadBackup(input: BackupUploadInput): Promise<BackupUploadResult>;
}

export type LocalCloudBackupOptions = BackupExportOptions & {
  intervalMs?: number;
  fileName?: string | ((snapshot: BackupSnapshot) => string);
  onError?: (error: unknown) => void;
};

type SnapshotExporter = {
  exportSnapshot(options?: BackupExportOptions): Promise<BackupSnapshot>;
};

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

export class LocalCloudBackupAdapter {
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<BackupUploadResult> | undefined;

  constructor(
    private readonly db: SnapshotExporter,
    private readonly target: CloudBackupTarget,
    private readonly options: LocalCloudBackupOptions = {}
  ) {}

  async backupNow(): Promise<BackupUploadResult> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.runBackup().finally(() => {
      this.inFlight = undefined;
    });

    return this.inFlight;
  }

  start(immediate = true): void {
    if (this.timer) return;

    const intervalMs = this.options.intervalMs ?? DEFAULT_INTERVAL_MS;

    if (immediate) {
      void this.backupNow().catch((e) => this.options.onError?.(e));
    }

    this.timer = setInterval(() => {
      void this.backupNow().catch((e) => this.options.onError?.(e));
    }, intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    if (this.inFlight) {
      await this.inFlight.catch(() => {});
    }
  }

  get running(): boolean {
    return this.timer !== undefined;
  }

  private async runBackup(): Promise<BackupUploadResult> {
    const snapshot = await this.db.exportSnapshot({
      collections: this.options.collections,
    });

    const content = JSON.stringify(snapshot, null, 2);

    return this.target.uploadBackup({
      fileName: this.resolveFileName(snapshot),
      content,
      contentType: "application/json",
      snapshot,
    });
  }

  private resolveFileName(snapshot: BackupSnapshot): string {
    if (typeof this.options.fileName === "function") {
      return this.options.fileName(snapshot);
    }

    if (this.options.fileName) {
      return this.options.fileName;
    }

    const stamp = snapshot.generatedAt.replace(/[:.]/g, "-");
    return `zerithdb-${snapshot.appId}-${stamp}.json`;
  }
}