import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import Stars from '../components/Stars';

const QA_TAG = { approved: ['green', 'QA approved'], pending: ['amber', 'Awaiting QA review'], rejected: ['red', 'Rejected by QA'] };
const qaTag = (status) => QA_TAG[status] || ['', status];

export default function OpportunityDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [opp, setOpp] = useState(null);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState({ ratings: [], mine: null });
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState('');
  const [actionError, setActionError] = useState('');

  function loadOpp() { api.get(`/opportunities/${id}`).then((d) => setOpp(d.opportunity)).catch((e) => setError(e.message)); }
  useEffect(() => { loadOpp(); }, [id]);
  useEffect(() => {
    api.get(`/opportunities/${id}/ratings`).then((d) => {
      setRatings(d);
      if (d.mine) { setMyRating(d.mine.rating); setMyComment(d.mine.comment || ''); }
    }).catch(() => {});
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!opp) return null;

  const canEdit = user.role === 'admin' || opp.created_by === user.id;
  const seesQa = ['educator', 'qa', 'manager', 'admin'].includes(user.role);
  const isApproved = opp.qa_status === 'approved';

  async function toggleBookmark() {
    setActionError('');
    try {
      const d = await api.post(`/opportunities/${opp.id}/bookmark`);
      setOpp({ ...opp, is_bookmarked: d.bookmarked });
    } catch (err) {
      setActionError(err.message);
    }
  }
  async function submitRating(e) {
    e.preventDefault();
    if (!myRating) return;
    setActionError('');
    try {
      await api.post(`/opportunities/${opp.id}/rating`, { rating: myRating, comment: myComment });
      setRatings(await api.get(`/opportunities/${opp.id}/ratings`));
      loadOpp();
    } catch (err) {
      setActionError(err.message);
    }
  }

  const facts = [
    ['Type', opp.type], ['Specialty', opp.specialty], ['Site / location', opp.site],
    ['Schedule', opp.schedule], ['Capacity', opp.capacity], ['Intended audience', opp.audience],
    ['Lead', opp.lead_name && `${opp.lead_name}${opp.lead_email ? ` (${opp.lead_email})` : ''}`],
  ].filter(([, v]) => v);

  return (
    <div>
      <p><Link to="/browse">← All opportunities</Link></p>
      <h1>{opp.title}</h1>
      <div style={{ margin: '6px 0 16px' }} className="detail-badges">
        {seesQa && <span className={`tag ${qaTag(opp.qa_status)[0]}`}>{qaTag(opp.qa_status)[1]}</span>}
        {!opp.active && <span className="tag red">Inactive</span>}
        {opp.rating_count > 0 && <Stars value={opp.rating_avg} count={opp.rating_count} small />}
      </div>

      {actionError && <div className="error">{actionError}</div>}

      {isApproved && (
        <div className="action-bar">
          {opp.booking_url && <a className="btn" href={opp.booking_url} target="_blank" rel="noreferrer">Book / find out more ↗</a>}
          <button type="button" className={opp.is_bookmarked ? 'small' : 'small secondary'} onClick={toggleBookmark}>
            {opp.is_bookmarked ? '★ Saved' : '☆ Save'}
          </button>
        </div>
      )}

      {opp.qa_status === 'rejected' && opp.qa_comments && canEdit && (
        <div className="error"><strong>QA feedback:</strong> {opp.qa_comments}</div>
      )}

      {opp.description && <div className="panel" style={{ marginBottom: 16 }}>{opp.description}</div>}

      <div className="table-scroll">
        <table style={{ maxWidth: 720 }}>
          <tbody>
            {facts.map(([k, v]) => <tr key={k}><th style={{ width: 180 }}>{k}</th><td>{v}</td></tr>)}
          </tbody>
        </table>
      </div>

      <h2>Mapped curriculum capabilities</h2>
      <div className="table-scroll">
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
      </div>

      {isApproved && (
        <>
          <h2>Ratings &amp; feedback</h2>
          <form className="panel" onSubmit={submitRating} style={{ maxWidth: 640 }}>
            <label>Your rating</label>
            <Stars value={myRating} onChange={setMyRating} />
            <label>Comment <span className="hint">optional — shared with educators and the QA team</span>
              <textarea value={myComment} onChange={(e) => setMyComment(e.target.value)} />
            </label>
            <button disabled={!myRating}>{ratings.mine ? 'Update my rating' : 'Submit rating'}</button>
          </form>
          {ratings.ratings.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {ratings.ratings.map((r, i) => (
                <div className="card" key={i}>
                  <Stars value={r.rating} small />
                  <div style={{ marginTop: 4 }}>{r.comment}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{r.user_name} · {r.updated_at?.slice(0, 10)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {canEdit && (
        <p style={{ marginTop: 20 }}>
          <Link to={`/opportunities/${opp.id}/edit`}><button className="secondary">Edit opportunity</button></Link>
        </p>
      )}
    </div>
  );
}
