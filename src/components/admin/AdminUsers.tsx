import { AdminMassUsers } from './AdminMassUsers';
import { AdminBulkActionDialog } from '@/features/admin/users/components/AdminBulkActionDialog';
import { AdminBulkSelectionDialog } from '@/features/admin/users/components/AdminBulkSelectionDialog';
import { AdminUserDetailDialog } from '@/features/admin/users/components/AdminUserDetailDialog';
import { AdminUserDirectoryCard } from '@/features/admin/users/components/AdminUserDirectoryCard';
import { AdminVirtualHubsCard } from '@/features/admin/users/components/AdminVirtualHubsCard';
import { useAdminUsersController } from '@/features/admin/users/useAdminUsersController';

export function AdminUsers() {
  const controller = useAdminUsersController();

  return (
    <div className="space-y-8">
      <AdminUserDirectoryCard model={controller.directory} />
      <AdminMassUsers onUsersCreated={controller.loadProfiles} />
      <AdminVirtualHubsCard model={controller.hubs} />
      <AdminBulkSelectionDialog model={controller.bulk} />
      <AdminUserDetailDialog model={controller.detail} />
      <AdminBulkActionDialog model={controller.bulk} />
    </div>
  );
}
