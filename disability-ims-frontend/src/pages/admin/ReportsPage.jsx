import { Users, Gauge, ClipboardCheck, Files, PackageCheck, ShieldCheck, Download } from 'lucide-react';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { DISABILITY } from '../../lib/i18n.js';
import { SECTORS, REQ_STATUSES } from '../../lib/constants.js';
import { downloadCsv, stamped } from '../../lib/csv.js';
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

  // These figures are the district's monthly return. Without an export the
  // only way to move them into a council paper is to retype them off the
  // screen, which is where transcription errors enter a report that is
  // supposed to be the authoritative one.
  const exportCsv = () => {
    const rows = [
      ['Registered beneficiaries', r.registered],
      ['Active in coordination', r.activeBeneficiaries],
      ['Estimated PwD population', r.estimatedPopulation],
      ['Coverage of estimated population (%)', r.coveragePercent],
      ['Record completeness (%)', r.completenessPercent],
      ['Duplication rate (%)', r.duplicationPercent],
      ['Verified records (%)', r.verifiedPercent],
      ['Beneficiaries with a direct login (%)', r.withAccountPercent],
      ['Total support requests', r.totalRequests],
      ['Support delivered', r.supportDelivered],
      ['Decisions carrying a recorded reason (%)', r.traceabilityPercent],
      ['Average turnaround (days)', r.avgTurnaroundDays ?? 'n/a'],
      ['Corrections awaiting review', r.pendingCorrections],
      ['Opportunity applications received', r.totalApplications ?? 0],
      ['Applications awaiting a decision', r.applicationsPending ?? 0],
      ['Applications accepted', r.applicationsAccepted ?? 0],
      ['Beneficiaries who have applied to anything (%)', r.applicantReachPercent ?? 0],
      ['Applications submitted by an officer on someone\'s behalf (%)', r.officerMediatedApplicationsPercent ?? 0],
      ['User accounts', r.totalUsers],
      ['Provider organisations', r.totalProviders],
      ['Opportunities published', r.totalOpportunities],
      ...Object.keys(DISABILITY).map((k) => [`Impairment · ${DISABILITY[k][0]}`, byImpairment[k] || 0]),
      ...REQ_STATUSES.map((k) => [`Requests · ${k}`, byStatus[k] || 0]),
      ...SECTORS.map((s) => [`Sector · ${s}`, bySector[s] || 0]),
    ];
    downloadCsv(stamped('district-report'), [
      { header: 'Measure', value: (row) => row[0] },
      { header: 'Value', value: (row) => row[1] },
    ], rows);
  };

  return (
    <>
      <div className="toolbar">
        <button className="btn ghost sm" onClick={exportCsv}>
          <Download className="h-[15px] w-[15px]" aria-hidden="true" />
          {t.x('Export report (CSV)', 'Kuramo raporo (CSV)')}
        </button>
        <button className="btn ghost sm" onClick={() => window.print()}>
          {t.x('Print', 'Gucapa')}
        </button>
      </div>

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

        {/* Publishing a scholarship is not the outcome; somebody applying for
            it is. Reach is the honest measure of whether publication reaches
            people or is merely performed — and the officer-mediated share is
            the size of the population a self-service-only system would have
            silently excluded. */}
        <Card>
          <div className="card-t">{t.x('Opportunity uptake', "Uko amahirwe akoreshwa")}</div>
          <small className="hint">
            {t.x('Publishing an opportunity is not the outcome — somebody applying for it is.',
              'Gutangaza amahirwe si cyo kigamijwe — gusabwa ni cyo.')}
          </small>
          <div className="rec" style={{ marginTop: 14 }}>
            <div className="rl">{t.x('Applications received', 'Ibyifuzo byakiriwe')}</div>
            <span className="rr">{r.totalApplications ?? 0}</span>
            <div className="rl">{t.x('Awaiting a decision', 'Bitegereje icyemezo')}</div>
            <span className="rr">{r.applicationsPending ?? 0}</span>
            <div className="rl">{t.x('Accepted', 'Byemewe')}</div>
            <span className="rr">{r.applicationsAccepted ?? 0}</span>
            <div className="rl">{t.x('Beneficiaries who have applied to anything', 'Abanditswe bigeze gusaba')}</div>
            <span className="rr">{r.applicantReachPercent ?? 0}%</span>
            <div className="rl">{t.x('Applications an officer had to submit for someone', 'Ibyifuzo umukozi yagombye gusabira undi')}</div>
            <span className="rr">
              {r.officerMediatedApplicationsPercent ?? 0}%{' '}
              <small className="hint">
                {t.x('— not a failure; the share who could not have applied alone',
                  '— si ikosa; ni umubare w\'abatari kubasha gusaba bonyine')}
              </small>
            </span>
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
