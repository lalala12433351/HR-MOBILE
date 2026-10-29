'use client';
import React from 'react';
import { useApp } from '@/context/AppContext';
import { PayslipsPage } from '@/components/modules/payroll/PayslipsPage';
export default function MyPayslipsPage(){const {state}=useApp();return <PayslipsPage state={state}/>;}
