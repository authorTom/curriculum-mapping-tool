import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Stars from '../components/Stars';

export default function Bookmarks() {
  const [opps, setOpps] = useState(null);

  useEffect(() => { api.get('/bookmarks').then((d) => setOpps(d.opportunities)); }, []);

  if (!opps) return null;
  return (
    <div>
      <h1>Saved learning</h1>
      <p className="lede">Opportunities you've bookmarked. Tap into one to book or log it against your portfolio.</p>
      {opps.length === 0 && <p className="muted">Nothing saved yet. Browse <Link to="/browse">Find learning</Link> and tap the ☆ to save courses here.</p>}
      <div className="grid">
        {opps.map((o) => (
          <div className="card" key={o.id}>
            <h3><Link to={`/opportunities/${o.id}`}>{o.title}</Link></h3>
            <div className="meta">{o.type}{o.specialty ? ` · ${o.specialty}` : ''}{o.site ? ` · ${o.site}` : ''}</div>
            {o.schedule && <div className="meta">{o.schedule}</div>}
            <div style={{ marginTop: 6 }}>
              <span className="tag">{o.capability_count} mapped</span>
              {o.rating_count > 0 && <Stars value={o.rating_avg} count={o.rating_count} small />}
            </div>
            {o.booking_url && <p style={{ margin: '8px 0 0' }}><a className="btn small" href={o.booking_url} target="_blank" rel="noreferrer">Book / find out more ↗</a></p>}
          </div>
        ))}
      </div>
    </div>
  );
}
