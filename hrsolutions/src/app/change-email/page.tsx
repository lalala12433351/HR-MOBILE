import { Suspense } from 'react';
import { QueryAuthView } from '@/components/auth/QueryAuthView';

export const metadata = { title: 'Change login email | Pixbe' };

export default function Page() {
  return <Suspense fallback={null}><QueryAuthView kind="email" /></Suspense>;
}
