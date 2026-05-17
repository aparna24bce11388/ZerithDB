export type BackupSnapshot = {
  format: string;
  appId: string;
  generatedAt: string;
  collections: Record<string, any[]>;
};

export type BackupExportOptions = {
  collections?: string[];
};