import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';

const QA_TAG = { approved: ['green', 'QA approved'], pending: ['amber', 'Awaiting QA review'], rejected: ['red', 'Rejected by QA'] };

export default function OpportunityDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [opp, setOpp] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/opportunities/${id}`).then((d) => setOpp(d.opportunity)).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!opp) return null;

  const canEdit = user.role === 'admin' || opp.created_by === user.id;
  const seesQa = ['educator', 'qa', 'manager', 'admin'].includes(user.role);

  const facts = [
    ['Type', opp.type], ['Specialty', opp.specialty], ['Site / location', opp.site],
    ['Schedule', opp.schedule], ['Capacity', opp.capacity], ['Intended audience', opp.audience],
    ['Lead', opp.lead_name && `${opp.lead_name}${opp.lead_email ? ` (${opp.lead_email})` : ''}`],
  ].filter(([, v]) => v);

  return (
    <div>
      <p><Link to="/browse">← All opportunities</Link></p>
      <h1>{opp.title}</h1>
      <div style={{ margin: '6px 0 16px' }}>
        {seesQa && <span className={`tag ${QA_TAG[opp.qa_status][0]}`}>{QA_TAG[opp.qa_status][1]}</span>}
        {!opp.active && <span className="tag red">Inactive</span>}
      </div>

      {opp.qa_status === 'rejected' && opp.qa_comments && canEdit && (
        <div className="error"><strong>QA feedback:</strong> {opp.qa_comments}</div>
      )}

      {opp.description && <div className="panel" style={{ marginBottom: 16 }}>{opp.description}</div>}

      <table style={{ maxWidth: 720 }}>
        <tbody>
          {facts.map(([k, v]) => <tr key={k}><th style={{ width: 180 }}>{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>

      <h2>Mapped curriculum capabilities</h2>
      <table style={{ maxWidth: 900 }}>
        <thead><tr><th>Capability</th><th>Curriculum</th>{user.role === 'trainee' && <th></th>}</tr></thead>
        <tbody>
          {opp.capabilities.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.code}</strong> — {c.title}<div className="muted">{c.description}</div></td>
              <td>{c.curriculum_name} <span className="tag">{c.curriculum_stage}</span></td>
              {user.role === 'trainee' && (
                <td>
                  <Link to={`/portfolio?add=1&capability_id=${c.id}&curriculum_id=${c.curriculum_id}&opportunity_id=${opp.id}&title=${encodeURIComponent(opp.title)}`}>
                    Log against this
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit && (
        <p style={{ marginTop: 20 }}>
          <Link to={`/opportunities/${opp.id}/edit`}><button className="secondary">Edit opportunity</button></Link>
        </p>
      )}
    </div>
  );
}
