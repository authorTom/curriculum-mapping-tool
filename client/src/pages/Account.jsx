import React from 'react';
import { useAuth } from '../App';
import ChangePassword from './ChangePassword';

export default function Account() {
  const { user } = useAuth();
  return (
    <div>
      <h1>My account</h1>
      <p className="lede">Your sign-in details and security.</p>
      <div className="card">
        <div className="meta"><strong>Name:</strong> {user.name}</div>
        <div className="meta"><strong>Email:</strong> {user.email}</div>
        <div className="meta"><strong>Role:</strong> {user.role}</div>
        {(user.grade || user.specialty) && (
          <div className="meta"><strong>Grade / specialty:</strong> {[user.grade, user.specialty].filter(Boolean).join(' · ')}</div>
        )}
      </div>
      <div style={{ maxWidth: 560 }}>
        <ChangePassword />
      </div>
    </div>
  );
}
