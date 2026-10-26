'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  || `${(process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.pixbe.in').replace(/\/+$/, '')}/api/v1`;

async function fetchBackend(endpoint: string, method: string, payload: any) {
  const cookieStore = await cookies();
  const token = cookieStore.get('BOS_AUTH_TOKEN')?.value;
  const tenantId = cookieStore.get('BOS_TENANT_ID')?.value;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (token && token.split('.').length === 3) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-ID'] = tenantId;

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned non-JSON response');
  }

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error?.message || 'Action failed');
  }
  
  return data;
}

export async function saveOfficeAction(prevState: any, formData: FormData) {
  try {
    const payload = {
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      address: formData.get('address') as string,
      latitude: Number(formData.get('latitude') || 12.9279),
      longitude: Number(formData.get('longitude') || 77.6271),
      timezone: formData.get('timezone') as string || 'UTC',
    };

    await fetchBackend('/setup/office', 'POST', payload);

    const cookieStore = await cookies();
    cookieStore.set('BOS_ONBOARDING_STATUS', 'OFFICE_SETUP', { path: '/' });
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/setup/departments');
  redirect('/setup/departments');
}

export async function saveDepartmentsAction(prevState: any, formData: FormData) {
  try {
    const rawDepts = formData.get('departments') as string;
    const departments = JSON.parse(rawDepts || '[]');
    if (!departments.length) throw new Error('At least one department is required.');

    await fetchBackend('/setup/departments', 'POST', { departments });

    const cookieStore = await cookies();
    cookieStore.set('BOS_ONBOARDING_STATUS', 'DEPARTMENTS_SETUP', { path: '/' });
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/setup/roles');
  redirect('/setup/roles');
}

export async function saveRolesAction(prevState: any, formData: FormData) {
  try {
    const rawRoles = formData.get('roles') as string;
    const roles = JSON.parse(rawRoles || '[]');
    if (!roles.length) throw new Error('At least one role is required.');

    await fetchBackend('/setup/roles', 'POST', { roles });

    const cookieStore = await cookies();
    cookieStore.set('BOS_ONBOARDING_STATUS', 'ROLES_SETUP', { path: '/' });
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/setup/team');
  redirect('/setup/team');
}

export async function saveTeamAction(prevState: any, formData: FormData) {
  try {
    const rawEmps = formData.get('employees') as string;
    const employees = JSON.parse(rawEmps || '[]');

    await fetchBackend('/setup/team', 'POST', { employees });

    const cookieStore = await cookies();
    cookieStore.set('BOS_ONBOARDING_STATUS', 'COMPLETED', { path: '/' });
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/dashboard');
  redirect('/dashboard');
}
