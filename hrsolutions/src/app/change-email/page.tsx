import { ChangeEmailView } from '@/components/auth/ChangeEmailView';

export const metadata = { title: 'Change login email | Pixbe' };

export default async function ChangeEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { email } = await searchParams;
  return <ChangeEmailView email={typeof email === 'string' ? email : ''} />;
}
