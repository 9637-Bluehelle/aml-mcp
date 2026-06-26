import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { UsersManagement } from './admin/UsersManagement';
import { ActivityLog } from './admin/ActivityLog';
import { Statistics } from './admin/Statistics';
import { SystemStatus } from './admin/SystemStatus';
import { StudiManagement } from './admin/StudiManagement';
import { RichiesteStudi } from './admin/RichiesteStudi';
import { SegnalazioniManagement } from './admin/SegnalazioniManagement';
import { MyStudioInfo } from './admin/MyStudioInfo';

interface AdminPanelProps {
  onBackToApp: () => void;
  ruolo: string;
}

export function AdminPanel({ onBackToApp, ruolo }: AdminPanelProps) {
  const isSuperAdmin = ruolo === 'superadmin';
  const [activeTab, setActiveTab] = useState('users');

  function renderContent() {
    switch (activeTab) {
      case 'users':
        return <UsersManagement isSuperAdmin={isSuperAdmin} />;
      case 'stats':
        return <Statistics isSuperAdmin={isSuperAdmin} />;
      case 'logs':
        return <ActivityLog isSuperAdmin={isSuperAdmin} />;
      case 'studi':
        return <StudiManagement />;
      case 'richieste':
        return <RichiesteStudi />;
      case 'segnalazioni':
        return <SegnalazioniManagement />;
      case 'system':
        return <SystemStatus />;
      case 'my-studio':
        return <MyStudioInfo />;
      default:
        return <UsersManagement isSuperAdmin={isSuperAdmin} />;
    }
  }

  return (
    <AdminLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onBackToApp={onBackToApp}
      isSuperAdmin={isSuperAdmin}
    >
      {renderContent()}
    </AdminLayout>
  );
}
