'use client';
// R7.7 — Avatar Tiểu Tâm biến hình theo theme: jade→Cáo Ngọc, gold→Hổ Hổ Phách, sage→Hạc Sage.
// Vẽ tay SVG viewBox 120x120, dùng biến màu theme (var --jade / --jade-d / --jade-soft).
// Sống theo status (mood): mắt/miệng đổi. Có halo + signature motion theo theme.
import { themeOf, type ThemeDef } from '../lib/theme';

type Status = string;

function eyesMouth(status: Status, cx1: number, cx2: number, eyeY: number, c: string, base: string) {
  const sleeping = status === 'kiet_suc';
  const tired = status === 'met';
  if (sleeping) return (
    <>
      <path d={`M${cx1 - 6} ${eyeY} Q${cx1} ${eyeY + 5} ${cx1 + 6} ${eyeY}`} fill="none" stroke="var(--txt)" strokeWidth="2.6" strokeLinecap="round" />
      <path d={`M${cx2 - 6} ${eyeY} Q${cx2} ${eyeY + 5} ${cx2 + 6} ${eyeY}`} fill="none" stroke="var(--txt)" strokeWidth="2.6" strokeLinecap="round" />
    </>
  );
  if (tired) return (
    <>
      <path d={`M${cx1 - 6} ${eyeY - 1} Q${cx1} ${eyeY + 3} ${cx1 + 6} ${eyeY - 1}`} fill="none" stroke="var(--txt)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx={cx2} cy={eyeY} r="4" fill="var(--txt)" />
    </>
  );
  return (
    <>
      <circle cx={cx1} cy={eyeY} r="4.4" fill="var(--txt)" />
      <circle cx={cx2} cy={eyeY} r="4.4" fill="var(--txt)" />
      <circle cx={cx1 + 1.5} cy={eyeY - 1.5} r="1.4" fill={base} />
      <circle cx={cx2 + 1.5} cy={eyeY - 1.5} r="1.4" fill={base} />
    </>
  );
}

/** jade — Cáo Ngọc */
function Fox({ status, c }: { status: Status; c: string }) {
  return (
    <>
      <path d="M30 44 L22 16 L48 32 Z" fill="var(--s3)" stroke={c} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M90 44 L98 16 L72 32 Z" fill="var(--s3)" stroke={c} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M31 38 L27 24 L42 33 Z" fill={c} opacity=".55" />
      <path d="M89 38 L93 24 L78 33 Z" fill={c} opacity=".55" />
      <path d="M60 26 C86 26 100 44 100 62 C100 84 84 100 60 104 C36 100 20 84 20 62 C20 44 34 26 60 26 Z" fill="var(--s2)" stroke={c} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M60 66 C74 66 84 74 84 84 C84 94 74 101 60 103 C46 101 36 94 36 84 C36 74 46 66 60 66 Z" fill="var(--s3)" opacity=".8" />
      {eyesMouth(status, 46, 74, 61, c, 'var(--base)')}
      <path d="M56 76 L64 76 L60 81 Z" fill={c} />
      {status === 'tran_day'
        ? <path d="M52 86 Q60 93 68 86" fill="none" stroke="var(--txt)" strokeWidth="2.4" strokeLinecap="round" />
        : <path d="M54 87 Q60 90 66 87" fill="none" stroke="var(--txt)" strokeWidth="2.2" strokeLinecap="round" />}
      <path d="M28 74 L38 76 M28 82 L38 81" stroke="var(--mut)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M92 74 L82 76 M92 82 L82 81" stroke="var(--mut)" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}

/** gold — Hổ Hổ Phách (halo hổ phách + sọc王) */
function Tiger({ status, c }: { status: Status; c: string }) {
  return (
    <>
      {/* halo hổ phách sau đầu */}
      <circle cx="60" cy="62" r="45" fill="none" stroke={c} strokeWidth="2" opacity=".2" strokeDasharray="6 10" />
      {/* tai tròn */}
      <path d="M38 40 C30 24 34 18 44 24 C50 27 52 33 50 40 Z" fill="var(--s3)" stroke={c} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M82 40 C90 24 86 18 76 24 C70 27 68 33 70 40 Z" fill="var(--s3)" stroke={c} strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="42" cy="31" r="3" fill={c} opacity=".5" />
      <circle cx="78" cy="31" r="3" fill={c} opacity=".5" />
      {/* đầu tròn chắc */}
      <path d="M60 24 C88 24 98 46 98 64 C98 86 82 100 60 102 C38 100 22 86 22 64 C22 46 32 24 60 24 Z" fill="var(--s2)" stroke={c} strokeWidth="2.8" strokeLinejoin="round" />
      {/* má phồng */}
      <path d="M60 68 C76 68 86 76 86 86 C86 95 75 101 60 102 C45 101 34 95 34 86 C34 76 44 68 60 68 Z" fill="var(--s3)" opacity=".75" />
      {/* sọc 王 trên trán */}
      <path d="M48 36 H72 M46 45 H74 M50 54 H70 M60 33 V57" stroke="var(--jade-d)" strokeWidth="2.4" strokeLinecap="round" />
      {/* sọc má 2 bên */}
      <path d="M30 62 Q38 64 40 70 M30 72 Q38 73 41 78" stroke="var(--jade-d)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M90 62 Q82 64 80 70 M90 72 Q82 73 79 78" stroke="var(--jade-d)" strokeWidth="2" strokeLinecap="round" fill="none" />
      {eyesMouth(status, 47, 73, 64, c, 'var(--base)')}
      {/* mũi tròn tam giác + mõm W */}
      <path d="M55 78 L65 78 L60 84 Z" fill="var(--jade-d)" />
      {status === 'tran_day'
        ? <path d="M50 88 Q55 94 60 89 Q65 94 70 88" fill="none" stroke="var(--txt)" strokeWidth="2.4" strokeLinecap="round" />
        : <path d="M53 89 Q60 92 67 89" fill="none" stroke="var(--txt)" strokeWidth="2.2" strokeLinecap="round" />}
      <path d="M30 80 L40 82 M30 87 L40 86" stroke="var(--mut)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M90 80 L80 82 M90 87 L80 86" stroke="var(--mut)" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}

/** sage — Hạc Sage (portrait cổ chữ S + cánh choàng + vành trăng) */
function Crane({ status, c }: { status: Status; c: string }) {
  const sleeping = status === 'kiet_suc';
  return (
    <>
      {/* vành trăng/lá sau lưng */}
      <path d="M26 82 Q30 30 74 24" fill="none" stroke={c} strokeWidth="2" opacity=".22" strokeLinecap="round" />
      {/* cánh choàng sau cổ */}
      <path d="M52 64 C34 70 22 84 30 100 C40 108 56 100 62 90 Z" fill="var(--s3)" stroke={c} strokeWidth="2.4" strokeLinejoin="round" opacity=".92" />
      <path d="M42 76 Q52 80 58 90 M36 84 Q46 88 52 96" fill="none" stroke="var(--jade-d)" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
      {/* cổ chữ S */}
      <path d="M64 98 C50 88 50 66 60 52 C66 44 70 42 72 40" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" />
      {/* đầu hạc nghiêng */}
      <path d="M60 40 C58 30 66 22 78 26 C86 29 86 40 78 46 C70 50 62 48 60 40 Z" fill="var(--s2)" stroke={c} strokeWidth="2.6" strokeLinejoin="round" />
      {/* mào đỏ (accentD) */}
      <path d="M70 24 Q73 18 76 24 Z" fill="var(--jade-d)" />
      {/* mỏ dài thanh */}
      <path d="M84 36 L106 33 L84 42 Z" fill="var(--jade-d)" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
      {/* mắt */}
      {sleeping
        ? <path d="M70 36 Q73 39 76 36" fill="none" stroke="var(--txt)" strokeWidth="2.4" strokeLinecap="round" />
        : <><circle cx="73" cy="36" r="3.4" fill="var(--txt)" /><circle cx="74" cy="35" r="1.1" fill="var(--base)" /></>}
    </>
  );
}

export function ThemedAvatar({ status, theme, size = 120 }: { status: Status; theme: string; size?: number }) {
  const t: ThemeDef = themeOf(theme);
  const c = 'var(--jade)';
  const sleeping = status === 'kiet_suc';
  return (
    <div className={`ta-stage ta-${t.motion} ta-${status}`} style={{ width: size, height: size }}>
      <div className="ta-ring" />
      <div className="ta-ring r2" />
      <div className="ta-aura" />
      <svg viewBox="0 0 120 120" className="ta-svg" width={size} height={size} aria-label="Tiểu Tâm">
        {t.avatar === 'fox' && <Fox status={status} c={c} />}
        {t.avatar === 'tiger' && <Tiger status={status} c={c} />}
        {t.avatar === 'crane' && <Crane status={status} c={c} />}
      </svg>
      {sleeping && <span className="ta-zzz mono">z z z</span>}
    </div>
  );
}
