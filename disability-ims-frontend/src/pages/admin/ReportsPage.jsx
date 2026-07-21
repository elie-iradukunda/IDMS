import { Users, Gauge, ClipboardCheck, Files, PackageCheck, ShieldCheck } from 'lucide-react';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { DISABILITY } from '../../lib/i18n.js';
import { SECTORS, REQ_STATUSES } from '../../lib/constants.js';
import { StatCard, BarRow, Card, Loading, ErrorState } from '../../components/ui.jsx';

// Table 5 measures: coverage, completeness, duplication, traceability,
// turnaround. Computed on the server from the live data.
export default function ReportsPage() {
  const { t } = useUI();
  const { data: r, loading, error, reload } = useFetch('/admin/reports');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const byImpairment = Object.fromEntries((r.byImpairment || []).map((x) => [x.type, x.count]));
  const byStatus = r.byStatus || {};
  const bySector = r.bySector || {};
  const totalReq = Object.values(byStatus).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="stats">
        <StatCard icon={Users} color="green" label={t.x('Registered', 'Abanditswe')} value={r.registered} />
        <StatCard icon={Gauge} color="emerald" label={t.x('Coverage of est. population', 'Coverage')} value={`${r.coveragePercent}%`} />
        <StatCard icon={ClipboardCheck} color="blue" label={t.x('Record completeness', 'Byuzuye')} value={`${r.completenessPercent}%`} />
        <StatCard icon={Files} color="amber" label={t.x('Duplication rate', 'Duplication')} value={`${r.duplicationPercent}%`} />
        <StatCard icon={PackageCheck} color="violet" label={t.x('Support delivered', 'Bwatanzwe')} value={r.supportDelivered} />
        <StatCard icon={ShieldCheck} color="green" label={t.x('Decisions with a reason', 'Ifite impamvu')} value={`${r.traceabilityPercent}%`} />
      </div>

      <div className="grid g2">
        <Card>
          <div className="card-t">{t.x('By impairment type', "Ku bwoko bw'ubumuga")}</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.keys(DISABILITY).map((k) => (
              <BarRow key={k} label={t.d(k)} count={byImpairment[k] || 0} total={r.registered} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-t">{t.x('Support requests by status', 'Ibyifuzo mu byiciro')}</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {REQ_STATUSES.map((k) => (
              <BarRow key={k} label={t(k)} count={byStatus[k] || 0} total={totalReq} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-t">{t.x('Coverage by sector', 'Ku murenge')}</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SECTORS.map((s) => (
              <BarRow key={s} label={s} count={bySector[s] || 0} total={r.registered} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-t">{t.x('What these numbers answer', 'Icyo imibare isobanura')}</div>
          <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>
            <b style={{ color: 'var(--text)' }}>{t.x('Coverage', 'Coverage')}</b> —{' '}
            {t.x('whether the registry finds the people it exists to serve.', 'niba registry ibona abo igenewe.')}
            <br />
            <b style={{ color: 'var(--text)' }}>{t.x('Duplication', 'Duplication')}</b> —{' '}
            {t.x('whether it is a single authoritative record.', 'niba ari inyandiko imwe yemewe.')}
            <br />
            <b style={{ color: 'var(--text)' }}>{t.x('Traceability', 'Traceability')}</b> —{' '}
            {t.x('whether support can be shown to be fair rather than merely asserted.', 'niba ubufasha bugaragara ko ari ubutabera.')}
            {r.avgTurnaroundDays != null && (
              <>
                <br />
                <b style={{ color: 'var(--text)' }}>{t.x('Avg. turnaround', 'Igihe gito')}</b> — {r.avgTurnaroundDays}{' '}
                {t.x('days from request to delivery.', "iminsi kuva ku cyifuzo kugeza ku gutanga.")}
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
