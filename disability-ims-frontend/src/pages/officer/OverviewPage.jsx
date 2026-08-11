import { Link } from 'react-router-dom';
import {
  Users, HandHeart, ClipboardList, Truck, PackageCheck, ShieldAlert, ArrowRight, Send,
} from 'lucide-react';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { timeAgo } from '../../lib/format.js';
import { StatCard, Card, Badge, Empty, Loading, ErrorState } from '../../components/ui.jsx';

// ─────────────────────────────────────────────────────────────
// The officer's workload, in one screen.
//
// Landing straight on the registry answers "who is recorded?" — a question
// nobody has first thing in the morning. The two questions that are actually
// time-critical are which requests are waiting on a decision and whose record
// is wrong right now, and both were previously invisible until the officer
// happened to open the right tab. Queued work that nobody is shown is queued
// work that ages, and a support request that ages is a person waiting.
//
// The oldest requests are listed first for the same reason: the longest wait
// is the one that has done the most harm, not the newest arrival.
// ─────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const { t, a } = useUI();
  const { data: o, loading, error, reload } = useFetch('/officer/overview');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const originLabel = {
    BENEFICIARY: t.x('Asked for it themselves', 'Yabisabye ubwe'),
    PROVIDER: t.x('Provider offer', 'Icyo provider atanga'),
    OFFICER: t.x('Officer-initiated', 'Umukozi yabikoze'),
  };

  return (
    <>
      <div className="stats">
        <StatCard
          icon={HandHeart} color="amber"
          label={t.x('Awaiting your decision', 'Bitegereje icyemezo cyawe')}
          value={o.pendingRequests}
          subtext={t.x('Support requests with no decision yet', 'Ibyifuzo bitarafatirwa icyemezo')}
        />
        <StatCard
          icon={ClipboardList} color="rose"
          label={t.x('Corrections to review', 'Ibyo gukosora')}
          value={o.pendingCorrections}
          subtext={t.x('Records a beneficiary says are wrong', 'Inyandiko uwunguka avuga ko zitari zo')}
        />
        <StatCard
          icon={Truck} color="blue"
          label={t.x('Approved, not yet distributed', 'Byemejwe bitaratangwa')}
          value={o.approved}
          subtext={t.x('Ready to start distribution', 'Bishobora gutangira gutangwa')}
        />
        <StatCard
          icon={PackageCheck} color="violet"
          label={t.x('Distribution in progress', 'Biri gutangwa')}
          value={o.distributing}
          subtext={t.x('Awaiting delivery confirmation', 'Bitegereje kwemezwa ko byatanzwe')}
        />
        <StatCard
          icon={Users} color="green"
          label={t.x('Registered district-wide', 'Banditswe mu karere')}
          value={o.beneficiaries}
          subtext={o.sector != null
            ? t.x(`${o.inMySector} in ${o.sector} · ${o.activeBeneficiaries} in active coordination`,
              `${o.inMySector} muri ${o.sector} · ${o.activeBeneficiaries} bakirimo`)
            : t.x(`${o.activeBeneficiaries} in active coordination`, `${o.activeBeneficiaries} bakirimo`)}
        />
        <StatCard
          icon={ShieldAlert} color="emerald"
          label={t.x('Support delivered', 'Ubufasha bwatanzwe')}
          value={o.completed}
          subtext={t.x('Confirmed and stored in support history', "Byemejwe kandi byanditswe mu mateka")}
        />
        {/* An application nobody opens is an application that was never
            really received, so the queue is on the dashboard like any other. */}
        <StatCard
          icon={Send} color="blue"
          label={t.x('Opportunity applications', 'Ibyifuzo by\'amahirwe')}
          value={o.pendingApplications}
          subtext={t.x('Awaiting a decision on a published opportunity', 'Bitegereje icyemezo ku mahirwe yatangajwe')}
        />
      </div>

      <div className="grid g2">
        <Card>
          <div className="card-t">{t.x('Waiting longest for a decision', 'Bimaze igihe kinini bitegereje')}</div>
          <small className="hint">
            {t.x('Oldest first. A request that has waited is a person who has waited — the queue is ordered by how long, not by when it arrived.',
              "Ibimaze igihe kirekire ni byo bibanza. Icyifuzo gitegereje ni umuntu utegereje.")}
          </small>

          {o.oldestWaiting?.length ? (
            <div style={{ marginTop: 6 }}>
              {o.oldestWaiting.map((r) => (
                <div key={r.id} className="notif" style={{ alignItems: 'flex-start' }}>
                  <div className="notif-ico" aria-hidden="true">⏳</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.45 }}>{r.need}</div>
                    <div className="meta">
                      <span className="code">{r.code}</span>
                      <span>{r.beneficiary?.fullName} ({r.beneficiary?.code})</span>
                      <span>{originLabel[r.origin]}</span>
                    </div>
                    <small className="hint">
                      {t.x('Submitted', 'Cyoherejwe')} {timeAgo(r.createdAt, a.lang)}
                    </small>
                  </div>
                </div>
              ))}
              <div className="row-actions">
                <Link className="btn sm" to="/officer/requests" style={{ textDecoration: 'none' }}>
                  {t.x('Go to support requests', 'Jya ku byifuzo')}
                  <ArrowRight className="h-[14px] w-[14px]" aria-hidden="true" />
                </Link>
              </div>
            </div>
          ) : (
            <Empty
              title={t.x('Nothing is waiting on a decision', 'Nta kigutegereje')}
              sub={t.x('Every support request has been decided.', 'Ibyifuzo byose byafatiwe icyemezo.')}
            />
          )}
        </Card>

        <Card>
          <div className="card-t">{t.x('Registry health', 'Ubuzima bwa registry')}</div>
          <small className="hint">
            {t.x('A registry that is not maintained decays, and the decay is invisible until someone is refused support on the strength of a stale record.',
              'Registry itavugururwa irangirika, kandi ntibigaragara kugeza umuntu yimwe ubufasha.')}
          </small>

          <div className="rec" style={{ marginTop: 14 }}>
            <div className="rl">{t.x('Unverified records', 'Inyandiko zitemejwe')}</div>
            <span className="rr">
              {o.unverified}{' '}
              {o.unverified > 0 && (
                <Badge tone="amber">{t.x('excluded from provider search', 'ntizigaragara kuri provider')}</Badge>
              )}
            </span>
            <div className="rl">{t.x('Corrections awaiting review', 'Ibyo gukosora bitegereje')}</div>
            <span className="rr">{o.pendingCorrections}</span>
            <div className="rl">{t.x('Opportunities published', 'Amahirwe yatangajwe')}</div>
            <span className="rr">{o.opportunities}</span>
          </div>

          <div className="row-actions">
            <Link className="btn ghost sm" to="/officer/registry" style={{ textDecoration: 'none' }}>
              {t.x('Open registry', 'Fungura registry')}
            </Link>
            <Link className="btn ghost sm" to="/officer/corrections" style={{ textDecoration: 'none' }}>
              {t.x('Review corrections', 'Suzuma ibyo gukosora')}
            </Link>
            <Link className="btn ghost sm" to="/officer/register" style={{ textDecoration: 'none' }}>
              {t.x('Register a beneficiary', 'Andika uwunguka')}
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
