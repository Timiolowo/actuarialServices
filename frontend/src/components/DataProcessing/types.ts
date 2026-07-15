export interface DataProcessingProps {
  portfolioId: string;
}

export interface ParsedModelInput {
  grossHeaders: string[];
  riHeaders: string[];
  grossData: Record<string, unknown>[];
  riData: Record<string, unknown>[];
}

export interface ReserveLOBData {
  lobName: string;
  attrIBNR: number;
  largeIBNR: number;
  outstandingClaims: number;
  grossIBNRTotal: number;
  grossOCRTotal: number;
  lastDate: string;
  dateMatches: boolean;
  yearCategory?: 'Current Year' | 'Prior Year';
  treaties?: Record<string, { attrIBNR: number; largeIBNR: number; outstandingClaims: number }>;
}

export interface ReserveSplitData {
  gross: ReserveLOBData[];
  ri: ReserveLOBData[];
  errors: string[];
  missingSheets: string[];
}

export interface VerificationRow {
  lobName: string;
  metric: string;
  expected: number | null;
  actual: number | null;
  matches: boolean | null; // null = no expected value provided
}

export interface UploadMatch {
  id: string;
  fileName: string;
  lobName: string;
  section: 'Gross' | 'RI' | 'Unmatched';
  matchCount: number;
  matchedLabels: string[];
}

export type OpeningStrategy = 'maintain' | 'change';
export type UploadSection = 'gross' | 'ri';

export const STEPS = [
  { number: 1, label: 'Parameters' },
  { number: 2, label: 'Upload Data' },
  { number: 3, label: 'Data Summary' },
  { number: 4, label: 'Review' },
] as const;

export const RESERVE_LOB_SHEETS = [
  'Aviation', 'Energy', 'Engineering', 'Fire CI', 'Fire PI',
  'GA CI', 'GA PI', 'Marine Cargo', 'Marine Hull',
  'Motor CI', 'Motor PI',
] as const;

export const SUPPORTED_UPLOAD_PATTERN = /\.(csv|xls|xlsx|xlsb|xlsm)$/i;

export const folderInputProps = { webkitdirectory: '', directory: '' } as {
  webkitdirectory: string;
  directory: string;
};

export const MONO_STYLE: import('react').CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};
