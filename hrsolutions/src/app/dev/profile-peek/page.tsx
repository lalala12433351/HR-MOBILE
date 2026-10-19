'use client';

import React from 'react';
import { EmployeeProfileCardModal } from '@/components/modules/hrms/EmployeeProfileCardModal';
import type { Employee } from '@/types';

/** Dev-only preview of the coworker public profile (desktop-inspired). */
const mockFounder = {
  id: 'emp-founder',
  name: 'Jabir C',
  fullName: 'Jabir C',
  email: 'jabir@example.com',
  designation: 'Founder',
  department: 'Leadership',
  team: 'Leadership',
  avatar: undefined,
} as Employee;

const mockManager = {
  id: 'emp-libin',
  name: 'Libin Johnson',
  fullName: 'Libin Johnson',
  email: 'libin@example.com',
  designation: 'Engineering Lead',
  department: 'Tech',
  team: 'Tech Team',
  managerId: 'emp-founder',
  avatar: undefined,
} as Employee;

const mockEmployee = {
  id: 'emp-neeraj',
  name: 'Neeraj',
  fullName: 'Neeraj',
  email: 'tech@arcle.in',
  phone: '7829764646',
  designation: 'Developer Intern',
  department: 'Tech',
  team: 'Tech Team',
  officeName: 'Kite Aviation',
  managerId: 'emp-libin',
  accountStatus: 'Active',
  bio: 'My vibe? Think creatively, ship carefully, and keep the product calm under pressure.',
  skills: ['TypeScript', 'React', 'Design systems'],
  timezone: 'Asia/Kolkata',
  avatar:
    'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=200&h=200&fit=crop',
} as Employee;

const mockReport = {
  id: 'emp-report',
  name: 'Asha Menon',
  fullName: 'Asha Menon',
  email: 'asha@example.com',
  designation: 'Junior Developer',
  department: 'Tech',
  managerId: 'emp-neeraj',
  avatar: undefined,
} as Employee;

export default function ProfilePeekPreviewPage() {
  return (
    <div className="min-h-screen bg-[#f3f5f7]">
      <EmployeeProfileCardModal
        isOpen
        onClose={() => undefined}
        employee={mockEmployee}
        allEmployees={[mockEmployee, mockManager, mockFounder, mockReport]}
        allowViewPublicProfile
        onViewFullProfile={() => undefined}
      />
    </div>
  );
}
