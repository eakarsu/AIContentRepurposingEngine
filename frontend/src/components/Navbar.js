import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiZap, FiLogOut, FiTrendingUp, FiGrid, FiActivity } from 'react-icons/fi';

function Navbar({ breadcrumbs = [] }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase()
    : user.email
    ? user.email[0].toUpperCase()
    : 'U';

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/dashboard" className="navbar-brand">
          <div className="navbar-brand-icon">
            <FiZap />
          </div>
          <span>Content Engine</span>
        </Link>
        {breadcrumbs.length > 0 && (
          <div className="navbar-breadcrumb">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                <span className="separator">/</span>
                {i === breadcrumbs.length - 1 ? (
                  <span className="current">{crumb.label}</span>
                ) : (
                  <Link to={crumb.to} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
      <div className="navbar-right">
        <Link to="/advanced" className="btn btn-outline" style={{ marginRight: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
          <FiTrendingUp /> Advanced
        </Link>
        <Link to="/custom-views" className="btn btn-outline" data-testid="nav-content-views" style={{ marginRight: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
          <FiGrid /> Content Views
        </Link>
        <Link to="/channel-fatigue" className="btn btn-outline" style={{ marginRight: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
          <FiActivity /> Fatigue
        </Link>
        <div className="navbar-user">
          <div className="navbar-avatar">{initials}</div>
          <div className="navbar-user-info">
            <span className="navbar-user-name">{user.name || user.email || 'User'}</span>
            <span className="navbar-user-role">Admin</span>
          </div>
        </div>
        <button className="btn-logout" onClick={handleLogout}>
          <FiLogOut style={{ marginRight: 6 }} />
          Logout
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
