'use client';

import { useActionState } from 'react';
import { registerAction } from '../actions/authActions';
import Link from 'next/link';

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your Workspace
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Start managing your HR operations today
          </p>
        </div>
        
        {state?.error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">{state.error}</p>
              </div>
            </div>
          </div>
        )}

        <form action={formAction} className="mt-8 space-y-6">
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="companyName" className="sr-only">Company Name</label>
              <input id="companyName" name="companyName" type="text" required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Company/Tenant Name" />
            </div>
            <div>
              <label htmlFor="adminName" className="sr-only">Admin Full Name</label>
              <input id="adminName" name="adminName" type="text" required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Admin Full Name" />
            </div>
            <div>
              <label htmlFor="adminEmail" className="sr-only">Admin Email</label>
              <input id="adminEmail" name="adminEmail" type="email" required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Admin Email address" />
            </div>
            <div>
              <label htmlFor="adminPassword" className="sr-only">Password</label>
              <input id="adminPassword" name="adminPassword" type="password" required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password (min 8 chars, 1 uppercase, 1 special)" />
            </div>
          </div>

          <div>
            <button type="submit" disabled={pending}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50">
              {pending ? 'Registering...' : 'Register Workspace'}
            </button>
          </div>
        </form>
        <div className="text-center mt-4">
          <Link href="/login" className="text-indigo-600 hover:text-indigo-500 text-sm font-medium">
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
