'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

export async function registerAction(prevState: any, formData: FormData) {
  try {
    const payload = {
      companyName: formData.get('companyName') as string,
      adminName: formData.get('adminName') as string,
      adminEmail: formData.get('adminEmail') as string,
      adminPassword: formData.get('adminPassword') as string,
      contactPhone: formData.get('contactPhone') as string,
    };

    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Registration failed');
    }

    const token = data.data.token;
    const tenantId = data.data.tenant.id;

    const cookieStore = await cookies();
    cookieStore.set('BOS_AUTH_TOKEN', token, { path: '/' });
    cookieStore.set('BOS_TENANT_ID', tenantId, { path: '/' });
    cookieStore.set('BOS_ONBOARDING_STATUS', 'NOT_STARTED', { path: '/' });

  } catch (error: any) {
    return { success: false, error: error.message };
  }

  revalidatePath('/setup/office');
  redirect('/setup/office');
}
