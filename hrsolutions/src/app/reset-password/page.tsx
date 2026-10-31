import { Suspense } from 'react';
import { QueryAuthView } from '@/components/auth/QueryAuthView';

export const metadata = { title: 'Reset password | Pixbe HR' };

export default function Page() {
  return <Suspense fallback={null}><QueryAuthView kind="reset" /></Suspense>;
}
