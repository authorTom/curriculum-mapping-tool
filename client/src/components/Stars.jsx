import React from 'react';

// Read-only star display, or interactive when onChange is provided.
export default function Stars({ value = 0, count, onChange, small }) {
  const rounded = Math.round(value);
  const cls = 'stars' + (small ? ' small' : '') + (onChange ? ' interactive' : '');
  return (
    <span className={cls}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={n <= (onChange ? value : rounded) ? 'star on' : 'star'}
          onClick={onChange ? () => onChange(n) : undefined}
          role={onChange ? 'button' : undefined}
          aria-label={onChange ? `${n} star${n > 1 ? 's' : ''}` : undefined}
        >★</span>
      ))}
      {count != null && <span className="stars-count">{value ? Number(value).toFixed(1) : ''} ({count})</span>}
    </span>
  );
}
