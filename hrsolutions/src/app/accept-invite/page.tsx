import { Suspense } from 'react';
import { QueryAuthView } from '@/components/auth/QueryAuthView';

export const metadata = { title: 'Set up your account | Pixbe' };

export default function Page() {
  return <Suspense fallback={null}><QueryAuthView kind="invite" /></Suspense>;
}
