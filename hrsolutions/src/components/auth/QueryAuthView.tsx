'use client';
import { useSearchParams } from 'next/navigation';
import { AcceptInviteView } from './AcceptInviteView';
import { ResetPasswordView } from './ResetPasswordView';
import { ChangeEmailView } from './ChangeEmailView';

export function QueryAuthView({ kind }: { kind: 'invite' | 'reset' | 'email' }) {
  const params = useSearchParams();
  if (kind === 'invite') return <AcceptInviteView token={params.get('token') || ''} />;
  if (kind === 'reset') return <ResetPasswordView token={params.get('token') || ''} />;
  return <ChangeEmailView email={params.get('email') || ''} />;
}
