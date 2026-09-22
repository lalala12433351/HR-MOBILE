'use client';

import { WorkspaceSetupWizard } from '@/components/modules/setup/WorkspaceSetupWizard';

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <WorkspaceSetupWizard />
    </div>
  );
}
