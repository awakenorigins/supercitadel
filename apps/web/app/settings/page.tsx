'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { getSession, clearSession } from '../../lib/api';

export default function SettingsPage() {
  const router = useRouter();
  const [name, setName] = useState(''); const [role, setRole] = useState('');
  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/'); return; }
    setName(s.user.displayName ?? 'Người dùng'); setRole(s.user.role);
  }, [router]);
  const roleLabel: Record<string, string> = { owner: 'Chủ quán', manager: 'Quản lý', staff: 'Nhân viên' };
  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h"><div className="k">Tài khoản</div><h1>Cài Đặt</h1></div>
        <div className="card" style={{ margin: '16px 20px 0', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 20, padding: 18 }}>
          <div className="ava mint" style={{ width: 64, height: 64, borderRadius: 20, fontSize: 26 }}>{name.slice(0, 1)}</div>
          <div>
            <div className="fd" style={{ fontWeight: 700, fontSize: 18 }}>{name}</div>
            <div className="mut" style={{ fontSize: 12.5, marginTop: 2 }}>{roleLabel[role] ?? role} · Cà Phê Nhà Mình</div>
          </div>
        </div>
        {[
          { gl: 'Tiểu Tâm', items: [
            { icon: 'spark', tint: 'var(--jade-soft)', color: 'var(--jade)', n: 'Chế độ tính cách', v: 'Thân thiện' },
            { icon: 'spark', tint: 'rgba(152,137,232,.14)', color: 'var(--violet)', n: 'Gợi ý chủ động', v: 'Bật' },
          ]},
          { gl: 'Tổ chức & Bảo mật', items: [
            { icon: 'coffee', tint: 'var(--amber-soft)', color: 'var(--amber)', n: 'Thông tin tổ chức', v: '' },
            { icon: 'shield', tint: 'rgba(236,106,133,.14)', color: 'var(--rose)', n: 'Bảo mật lũy tiến', v: 'Cấp 2/4' },
            { icon: 'users', tint: 'var(--s3)', color: 'var(--dim)', n: 'Thành viên & quyền', v: '' },
          ]},
        ].map((g) => (
          <div key={g.gl} style={{ margin: '20px 20px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase', padding: '0 4px 8px' }}>{g.gl}</div>
            <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
              {g.items.map((it, i) => (
                <div key={it.n} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: i < g.items.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: it.tint, color: it.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={it.icon} size={16} /></div>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{it.n}</div>
                  {it.v && <span className="mono" style={{ fontSize: 12.5, color: 'var(--mut)' }}>{it.v}</span>}
                  <Icon name="chevron" size={18} style={{ color: 'var(--faint)' }} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ margin: '20px 20px 0' }}>
          <div className="card" style={{ borderRadius: 16 }}>
            <button onClick={() => { clearSession(); router.replace('/'); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', background: 'none', border: 'none', color: 'var(--rose)', fontSize: 14, fontWeight: 500 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--s3)', display: 'grid', placeItems: 'center' }}><Icon name="logout" size={16} /></div>
              Đăng xuất
            </button>
          </div>
        </div>
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
