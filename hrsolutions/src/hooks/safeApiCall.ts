/**
 * Soft-fail wrapper for apiClient calls that throw ApiClientError on 403/4xx.
 * Prevents Promise.all from aborting the whole dashboard/HR fetch for employees.
 */
export async function safeApiCall<T = any>(
  promise: Promise<{ success?: boolean; data?: T; error?: any }>,
  fallback: T
): Promise<{ success: boolean; data: T }> {
  try {
    const res = await promise;
    if (res?.success && res.data !== undefined && res.data !== null) {
      return { success: true, data: res.data as T };
    }
    return { success: false, data: fallback };
  } catch {
    return { success: false, data: fallback };
  }
}
