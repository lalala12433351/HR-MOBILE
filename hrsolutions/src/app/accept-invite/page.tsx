import { AcceptInviteView } from '@/components/auth/AcceptInviteView';

export const metadata = { title: 'Set up your account | Pixbe' };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await searchParams;
  return <AcceptInviteView token={typeof token === 'string' ? token : ''} />;
}
