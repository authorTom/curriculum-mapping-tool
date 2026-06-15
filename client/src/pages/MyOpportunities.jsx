import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const QA_TAG = { approved: ['green', 'QA approved'], pending: ['amber', 'Awaiting QA'], rejected: ['red', 'Rejected — see feedback'] };

export default function MyOpportunities() {
  const [opps, setOpps] = useState([]);

  useEffect(() => {
    api.get('/opportunities?mine=true').then((d) => setOpps(d.opportunities));
  }, []);

  return (
    <div>
      <h1>My learning opportunities</h1>
      <p className="lede">Opportunities you have submitted. New and edited entries are reviewed by the QA team before trainees can see them.</p>

      <Link to="/opportunities/new"><button>+ Add a learning opportunity</button></Link>

      {opps.length === 0 && <p className="muted" style={{ marginTop: 16 }}>You haven't added any opportunities yet.</p>}
      <div style={{ marginTop: 16 }}>
        {opps.map((o) => (
          <div className="card" key={o.id}>
            <h3><Link to={`/opportunities/${o.id}`}>{o.title}</Link></h3>
            <div className="meta">{o.type}{o.specialty ? ` · ${o.specialty}` : ''} · {o.capability_count} capabilities mapped</div>
            <div style={{ marginTop: 6 }}>
              <span className={`tag ${QA_TAG[o.qa_status][0]}`}>{QA_TAG[o.qa_status][1]}</span>
              {!o.active && <span className="tag red">Inactive</span>}
              <Link style={{ marginLeft: 10 }} to={`/opportunities/${o.id}/edit`}>Edit</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
