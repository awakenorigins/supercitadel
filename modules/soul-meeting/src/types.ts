/**
 * SOUL-MEETING 1A — kiểu dữ liệu chung
 * Module ORG-SCOPE (khác Soul-Wallet per-owner): dữ liệu họp thuộc tổ chức,
 * actor (userId từ JWT) dùng cho created_by / audit / quyền theo vai trò họp.
 *
 * Plug-and-play: mọi năng lực ngoài module (ASR, notify, contacts, files)
 * là OPTIONAL CAPABILITY host tiêm qua ctx.caps — thiếu thì degrade, không vỡ.
 */
import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SmDb = PgDatabase<any, any, any>;

/** Payload event bắt buộc mang org_id (mặt cắt ⑤ chuẩn Citadel) */
export interface SmEventPayload {
  org_id: string;
  [key: string]: unknown;
}

export interface EventBus {
  emit(name: `sm.${string}`, payload: SmEventPayload): void | Promise<void>;
}

/** ── Optional capabilities (host inject — module KHÔNG import module khác) ── */

/** Kết quả 1 segment ASR trả về từ worker */
export interface AsrSegment {
  startMs: number;
  endMs: number;
  text: string;
  speakerLabel?: string;
  confidence?: number;
}
/** Capability bóc băng — host nối tới services/asr-worker (sidecar).
 *  Thiếu capability này → requestTranscription ném ASR_UNAVAILABLE, mọi thứ khác chạy bình thường. */
export interface AsrCapability {
  transcribe(input: { fileRef: string; lang: string; engine?: string }): Promise<AsrSegment[]>;
}
/** Capability gửi thông báo (notify core). Thiếu → nhắc lịch chỉ đếm, không gửi. */
export type NotifyCapability = (input: {
  orgId: string; userId: string; title: string; body?: string; link?: string;
}) => void | Promise<void>;
/** Capability tra cứu liên hệ (Soul-Sale). Thiếu → suggest trả []. */
export type ContactsLookupCapability = (input: {
  orgId: string; q: string; limit?: number;
}) => Promise<Array<{ ref: string; name: string; email?: string; phone?: string }>>;

export interface SmCaps {
  asr?: AsrCapability;
  notify?: NotifyCapability;
  contacts?: ContactsLookupCapability;
}

/** Ngữ cảnh tenant cho MỌI lời gọi service.
 *  orgId + userId lấy từ JWT tại host-adapter — client không có quyền khai. */
export interface SmCtx {
  db: SmDb;
  orgId: string;
  /** actor — user đang thao tác (JWT sub) */
  userId: string;
  bus: EventBus;
  caps?: SmCaps;
  /** thời điểm "bây giờ" — inject được trong test để kiểm định nhắc lịch/series */
  now?: () => Date;
}

export const nowOf = (ctx: SmCtx): Date => (ctx.now ? ctx.now() : new Date());

/** Lỗi nghiệp vụ có mã — Tiểu Tâm đọc code để phản hồi chính xác */
export class SmError extends Error {
  constructor(
    public code:
      | 'MEETING_NOT_FOUND' | 'MEETING_STATUS_INVALID' | 'MEETING_TIME_INVALID'
      | 'AGENDA_REQUIRED' | 'AGENDA_ITEM_NOT_FOUND' | 'AGENDA_ALREADY_PUBLISHED'
      | 'TYPE_NOT_FOUND' | 'SERIES_NOT_FOUND' | 'SERIES_RULE_INVALID'
      | 'PARTICIPANT_NOT_FOUND' | 'PARTICIPANT_DUPLICATE' | 'PARTICIPANT_INVALID'
      | 'DOCUMENT_NOT_FOUND' | 'CHECKLIST_NOT_FOUND' | 'NOTE_NOT_FOUND'
      | 'DECISION_NOT_FOUND' | 'VOTE_NOT_FOUND' | 'VOTE_CLOSED' | 'VOTE_STILL_OPEN'
      | 'BALLOT_DUPLICATE' | 'CHOICE_INVALID' | 'QUORUM_NOT_MET'
      | 'ACTION_NOT_FOUND' | 'ACTION_STATUS_INVALID'
      | 'MINUTES_NOT_FOUND' | 'MINUTES_IMMUTABLE' | 'MINUTES_STATUS_INVALID'
      | 'RECORDING_NOT_FOUND' | 'RECORDING_STATUS_INVALID' | 'ASR_UNAVAILABLE'
      | 'SEGMENT_NOT_FOUND' | 'FEEDBACK_DUPLICATE'
      | 'PERMISSION_DENIED' | 'INVALID_INPUT',
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SmError';
  }
}

/** VND helper — numeric(18,0), làm tròn về số nguyên đồng */
export const money = (n: number | string): string => String(Math.round(Number(n)));

/** ISO date (yyyy-mm-dd) từ Date */
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
