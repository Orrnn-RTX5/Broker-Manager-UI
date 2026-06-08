import { ShieldAlert, Loader2 } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Route/section guard. Renders children only when the current session holds the
 * required permission (admins always pass). While the permission set is still
 * loading it renders children (fail-open) so admins/managers never see a flicker
 * lockout — the backend RequirePermission middleware is the real authority.
 *
 * Usage:
 *   <RequirePermission permission="manage_groups"><GroupsPage /></RequirePermission>
 */
const Denied = () => (
  <div className="w-full h-full flex items-center justify-center p-8">
    <div
      className="ui-card flex flex-col items-center justify-center text-center p-8 max-w-md"
      style={{ background: 'var(--surface-2)' }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
        style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}
      >
        <ShieldAlert size={20} />
      </div>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
        Access restricted
      </h3>
      <p className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>
        Your role does not have permission to view this section. Contact your
        broker administrator if you believe this is a mistake.
      </p>
    </div>
  </div>
);

const RequirePermission = ({ permission, children, fallback }) => {
  const { hasPermission, loading, resolved } = usePermissions();

  if (loading && !resolved) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8" style={{ color: 'var(--text-3)' }}>
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (!hasPermission(permission)) {
    return fallback || <Denied />;
  }

  return children;
};

export default RequirePermission;
