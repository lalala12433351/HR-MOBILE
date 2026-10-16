import { ResetPasswordView } from '@/components/auth/ResetPasswordView';

export const metadata = { title: 'Reset password | Pixbe' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordView token={typeof token === 'string' ? token : ''} />;
}
