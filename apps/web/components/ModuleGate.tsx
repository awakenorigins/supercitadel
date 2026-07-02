'use client';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
export function ModuleLocked({ name }: { name: string }) {
  const router = useRouter();
  return (
    <div style={{ padding: '60px 30px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--s2)', border: '1px solid var(--bd2)', display: 'grid', placeItems: 'center', margin: '0 auto 18px', color: 'var(--mut)' }}><Icon name="shield" size={28} /></div>
      <b className="fd" style={{ fontSize: 17 }}>{name} chưa kích hoạt</b>
      <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>Mua hoặc bật module trong Cửa hàng để sử dụng.</p>
      <button className="btn-p" style={{ maxWidth: 220, margin: '18px auto 0' }} onClick={() => router.push('/modules')}>Tới Cửa hàng Module</button>
    </div>
  );
}
