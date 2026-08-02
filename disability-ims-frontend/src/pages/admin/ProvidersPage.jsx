import { useState, useRef } from 'react';
import { Building2, Pencil, Trash2 } from 'lucide-react';
import { post, patch, del } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { Card, Badge, Empty, Loading, ErrorState } from '../../components/ui.jsx';
import { FormModal, ConfirmModal } from '../../components/Modal.jsx';

const TYPES = ['NGO', 'Cooperative', 'Employer', 'Donor', 'Government', 'Faith-based'];

// Provider organisations. A provider account cannot exist without an
// organisation to belong to, so the administrator has to be able to create
// one — otherwise the support-provider role is unusable on a fresh install.
export default function ProvidersPage() {
  const { t } = useUI();
  const { data, loading, error, reload } = useFetch('/admin/providers');
  const [dialog, setDialog] = useState(null);

  const close = () => setDialog(null);
  const done = () => { close(); reload(); };

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <div className="toolbar">
        <button className="app-button" onClick={() => setDialog({ kind: 'create' })}>
          <Building2 className="h-[16px] w-[16px]" aria-hidden="true" style={{ marginRight: 7 }} />
          {t.x('Add organisation', 'Ongeraho umuryango')}
        </button>
      </div>

      <Card style={{ marginTop: 16 }}>
        <div className="card-t">{t.x('Support provider organisations', 'Imiryango itanga ubufasha')}</div>
        <small className="hint">
          {t.x('NGOs, cooperatives, employers and donors that search recorded needs and offer targeted support. The counts show what each has actually done, not merely that it exists.',
            'Imiryango ishakisha ubukene ikanatanga ubufasha. Imibare igaragaza ibyakozwe.')}
        </small>

        {data?.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <caption className="sr-only">{t.x('Provider organisations with account and offer counts', 'Imiryango n\'imibare yayo')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.x('Organisation', 'Umuryango')}</th>
                  <th scope="col">{t.x('Type', 'Ubwoko')}</th>
                  <th scope="col">{t.x('Contact', 'Aho bagerwaho')}</th>
                  <th scope="col">{t.x('Accounts', 'Konti')}</th>
                  <th scope="col">{t.x('Requests', 'Ibyifuzo')}</th>
                  <th scope="col">{t.x('Actions', 'Ibikorwa')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.type ? <Badge tone="sky">{p.type}</Badge> : <span style={{ color: 'var(--muted-2)' }}>—</span>}</td>
                    <td style={{ fontSize: 13, color: 'var(--muted)' }}>{p.contact || '—'}</td>
                    <td>{p.accounts}</td>
                    <td>{p.offers}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn ghost sm" onClick={() => setDialog({ kind: 'edit', p })}
                          aria-label={t.x(`Edit ${p.name}`, `Hindura ${p.name}`)}>
                          <Pencil className="h-[14px] w-[14px]" aria-hidden="true" />
                        </button>
                        <button className="btn red sm" onClick={() => setDialog({ kind: 'delete', p })}
                          disabled={p.accounts > 0 || p.offers > 0}
                          title={p.accounts || p.offers
                            ? t.x('In use by accounts or support history', 'Ikoreshwa na konti cyangwa amateka')
                            : ''}
                          aria-label={t.x(`Delete ${p.name}`, `Siba ${p.name}`)}>
                          <Trash2 className="h-[14px] w-[14px]" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={t.x('No provider organisations yet', 'Nta muryango uhari')}
            sub={t.x('Add one before creating a support-provider account.', 'Ongeraho umwe mbere yo gukora konti.')}
          />
        )}
      </Card>

      {dialog?.kind === 'create' && <ProviderDialog onClose={close} onDone={done} />}
      {dialog?.kind === 'edit' && <ProviderDialog p={dialog.p} onClose={close} onDone={done} />}
      {dialog?.kind === 'delete' && <DeleteDialog p={dialog.p} onClose={close} onDone={done} />}
    </>
  );
}

function ProviderDialog({ p, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const editing = !!p;
  const [f, setF] = useState({ name: p?.name || '', type: p?.type || '', contact: p?.contact || '' });
  const m = useMutation();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={editing ? t.x(`Edit ${p.name}`, `Hindura ${p.name}`) : t.x('Add a provider organisation', 'Ongeraho umuryango')}
      subtitle={t.x('Support-provider accounts belong to an organisation, and offers are recorded against it — so the district can see which organisations are actually delivering.',
        'Konti za provider ziba mu muryango, kandi ibyo batanga byandikwa kuri wo.')}
      submitLabel={editing ? t.x('Save changes', 'Bika') : t.x('Add organisation', 'Ongeraho')}
      onSubmit={() => {
        if (!f.name.trim()) return m.setError(t.x('An organisation name is required.', 'Izina rirakenewe.'));
        return m.run(
          () => (editing ? patch(`/admin/providers/${p.id}`, f) : post('/admin/providers', f)),
          { success: editing ? t.x('Organisation updated', 'Byavuguruwe') : t.x('Organisation added', 'Byongewemo'), then: onDone },
        );
      }}
    >
      <div className="form-grid">
        <div className="full">
          <label className="field-label" htmlFor="p-name">{t.x('Organisation name', "Izina ry'umuryango")} *</label>
          <input ref={first} id="p-name" className="app-input" value={f.name} onChange={set('name')} />
        </div>
        <div>
          <label className="field-label" htmlFor="p-type">{t.x('Type', 'Ubwoko')}</label>
          <select id="p-type" className="app-select" value={f.type} onChange={set('type')}>
            <option value="">{t.x('Not specified', 'Ntibyavuzwe')}</option>
            {TYPES.map((x) => <option key={x}>{x}</option>)}
            {f.type && !TYPES.includes(f.type) && <option>{f.type}</option>}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="p-contact">{t.x('Contact', 'Aho bagerwaho')}</label>
          <input id="p-contact" className="app-input" value={f.contact} onChange={set('contact')}
            placeholder="email / telephone" />
        </div>
      </div>
    </FormModal>
  );
}

function DeleteDialog({ p, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone="red"
      title={t.x(`Delete ${p.name}?`, `Gusiba ${p.name}?`)}
      message={t.x('This removes the organisation permanently. It is only possible because no accounts belong to it and it has no support history — deleting one that did would orphan both.',
        "Bisiba umuryango burundu. Bishoboka kuko nta konti cyangwa amateka bifitanye isano na wo.")}
      confirmLabel={t.x('Delete organisation', 'Siba')}
      onConfirm={() => m.run(() => del(`/admin/providers/${p.id}`), {
        success: t.x('Organisation deleted', 'Yasibwe'), then: onDone,
      })}
    />
  );
}
