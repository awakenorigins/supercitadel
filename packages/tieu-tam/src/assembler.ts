// assembler.ts — Context Assembler: MỘT cổng ngữ cảnh duy nhất (nguyên tắc 3, spec §03).
// Mọi adapter (stub/openai/anthropic/…) đều nhận CÙNG WorkProfile trung lập này.
// Hồn (persona + trí nhớ + mood/energy) tách hẳn khỏi động cơ (model).
import { orgModules } from '@citadel/db';
import { and, eq } from 'drizzle-orm';
import { TIEU_TAM_PERSONA, type Persona } from './persona.js';
import { recall, type Memory } from './memory.js';
import { getSoulState, type EnergyStatus } from './energy.js';
import { loadModuleDocs, type ModuleDoc } from './docs.js';

export interface WorkProfile {
  persona: Persona;
  /** Trí nhớ liên quan (text thuần) — adapter tự render theo format của model. */
  memories: Memory[];
  /** Module đang bật của org → Tiểu Tâm biết mình có thể làm gì. */
  moduleMap: string[];
  /** Giáo trình các module active (V7A P4 — G6): bản đồ năng lực + hướng dẫn thật để trả lời 'help'. Cache file — không đọc lại mỗi request. */
  moduleDocs: ModuleDoc[];
  mood: string;
  energy: number;
  status: EnergyStatus;
  engine: string;
}

/**
 * Cổng ngữ cảnh duy nhất: gom persona + trí nhớ + module map + mood/energy
 * thành một object TRUNG LẬP. Adapter nào cũng đi qua đây — không adapter nào
 * được tự móc thẳng vào DB trí nhớ.
 */
export async function buildWorkProfile(
  db: any,
  orgId: string,
  userId: string,
  opts: { query?: string; memoryLimit?: number } = {},
): Promise<WorkProfile> {
  const [memories, soul, mods] = await Promise.all([
    recall(db, orgId, userId, opts.query, opts.memoryLimit ?? 20),
    getSoulState(db, orgId, userId),
    db.select().from(orgModules).where(and(eq(orgModules.orgId, orgId), eq(orgModules.status, 'active'))).catch(() => []),
  ]);
  const moduleMap = (mods as any[]).map((m) => m.moduleId);
  // accounting = M0 mặc định mọi tài khoản — luôn có trong bản đồ năng lực kể cả khi chưa mua module trả phí khác
  const docIds = moduleMap.includes('accounting') ? moduleMap : [...moduleMap, 'accounting'];
  return {
    persona: TIEU_TAM_PERSONA,
    memories,
    moduleMap,
    moduleDocs: loadModuleDocs(docIds),
    mood: soul.mood,
    energy: soul.energy,
    status: soul.status,
    engine: soul.engine,
  };
}
